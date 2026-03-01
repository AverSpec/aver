import { randomUUID } from 'node:crypto'
import type { Domain } from './domain'
import type { Adapter } from './adapter'
import type { TraceEntry, TraceAttachment } from './trace'
import { runWithTestContext } from './test-context'
import { createProxies } from './proxy'
import type { CalledOps } from './proxy'
import { enhanceWithTrace } from './trace-format'
import { getTeardownFailureMode } from './config'
import type { TestContext } from './suite'

export async function runTestWithAdapter<D extends Domain>(
  adapter: Adapter,
  domain: D,
  testName: string,
  fn: (ctx: TestContext<D>) => Promise<void>,
  calledOps?: CalledOps,
): Promise<void> {
  const trace: TraceEntry[] = []
  const correlationId = randomUUID()
  const ctx = await adapter.protocol.setup()
  const proxies = createProxies(domain, () => ctx, () => adapter, trace, calledOps, correlationId)
  const metadata = {
    testName,
    domainName: domain.name,
    adapterName: adapter.domain.name,
    protocolName: adapter.protocol.name,
  }

  let testBodyFailed = false

  try {
    await adapter.protocol.onTestStart?.(ctx, metadata)
    await runWithTestContext(
      {
        testName,
        domainName: domain.name,
        protocolName: adapter.protocol.name,
        trace,
        extensions: adapter.protocol.extensions ?? {},
      },
      async () => fn({ act: proxies.act, given: proxies.given, when: proxies.when, query: proxies.query, assert: proxies.assert, then: proxies.then, trace: () => [...trace] }),
    )
    await adapter.protocol.onTestEnd?.(ctx, { ...metadata, status: 'pass', trace: [...trace] })
  } catch (error) {
    testBodyFailed = true
    let attachments: TraceAttachment[] | undefined
    try {
      const result = await adapter.protocol.onTestFail?.(ctx, { ...metadata, status: 'fail', error, trace: [...trace] })
      if (Array.isArray(result)) attachments = result
    } catch (hookError) {
      trace.push({
        kind: 'test',
        name: 'hook-error:onTestFail',
        payload: undefined,
        status: 'fail',
        error: hookError,
        correlationId,
      })
    }
    if (attachments && attachments.length > 0) {
      trace.push({
        kind: 'test',
        name: 'failure-artifacts',
        payload: undefined,
        status: 'fail',
        attachments,
        correlationId,
      })
    }
    try {
      await adapter.protocol.onTestEnd?.(ctx, { ...metadata, status: 'fail', error, trace: [...trace] })
    } catch (hookError) {
      trace.push({
        kind: 'test',
        name: 'hook-error:onTestEnd',
        payload: undefined,
        status: 'fail',
        error: hookError,
        correlationId,
      })
    }
    throw enhanceWithTrace(error, trace, domain, adapter.protocol.name)
  } finally {
    try {
      await adapter.protocol.teardown(ctx)
    } catch (teardownError) {
      trace.push({
        kind: 'test',
        name: 'teardown-error',
        payload: undefined,
        status: 'fail',
        error: teardownError,
        correlationId,
      })
      // When the test body passed, teardown failures should fail the test
      // (unless configured to only warn). When the test body already failed,
      // we preserve the original error and only record the teardown error in trace.
      if (!testBodyFailed && getTeardownFailureMode() === 'fail') {
        throw enhanceWithTrace(teardownError, trace, domain, adapter.protocol.name)
      }
    }
  }
}
