import { randomUUID } from 'node:crypto'
import type { Domain } from './domain'
import type { Adapter } from './adapter'
import type { TraceEntry, TraceAttachment } from './trace'
import { runWithTestContext } from './test-context'
import { createProxies } from './proxy'
import type { CalledOps } from './proxy'
import { resolveTelemetryMode } from './telemetry-mode'
import { verifyCorrelation } from './correlation'
import { enhanceComposedWithTrace } from './trace-format'
import { getTeardownFailureMode } from './config'
import type { TestContext } from './suite'
import { isExtractionMode, registerTestResult } from './extract-registry'

/** A single entry in the adapter tuple array passed to `runTest`. */
export type AdapterEntry = [name: string, domain: Domain, adapter: Adapter]

/**
 * Generalized test runner that handles 1-to-N adapters with a single code path.
 *
 * - Single adapter: `runTest([['name', domain, adapter]], testName, fn)`
 *   The callback receives a flat context with act/given/when/query/assert/then/trace.
 * - Multiple adapters: `runTest([['a', d1, a1], ['b', d2, a2]], testName, fn)`
 *   The callback receives a context with named keys, each containing act/given/when/query/assert/then,
 *   plus a top-level `trace()`.
 */
export async function runTest(
  entries: AdapterEntry[],
  testName: string,
  fn: (ctx: any) => Promise<void>,
  calledOpsMap?: Map<string, CalledOps>,
): Promise<void> {
  const trace: TraceEntry[] = []
  const correlationId = randomUUID()
  const isMulti = entries.length > 1

  // ── Setup all protocols with partial teardown on failure ──
  const contexts = new Map<string, any>()
  for (const [name, , adapter] of entries) {
    try {
      const ctx = await adapter.protocol.setup()
      contexts.set(name, ctx)
    } catch (setupError) {
      // Teardown already-setup protocols in reverse order
      const setupKeys = [...contexts.keys()].reverse()
      for (const k of setupKeys) {
        const adapterEntry = entries.find(([n]) => n === k)!
        try {
          await adapterEntry[2].protocol.teardown(contexts.get(k))
        } catch (teardownErr) {
          trace.push({
            kind: 'test',
            name: `teardown-error:${adapterEntry[2].protocol.name}`,
            payload: undefined,
            status: 'fail',
            error: teardownErr,
            correlationId,
          })
          console.warn(
            `[aver] Teardown failed for "${k}" after setup error: ${teardownErr instanceof Error ? teardownErr.message : String(teardownErr)}`,
          )
        }
      }
      throw setupError
    }
  }

  // ── Build per-adapter proxies, all sharing the same trace array ──
  const namespaces: Record<string, any> = {}
  for (const [name, domain, adapter] of entries) {
    const calledOps = calledOpsMap?.get(name)
    const proxies = createProxies(
      domain,
      () => contexts.get(name),
      () => adapter,
      trace,
      calledOps,
      correlationId,
      Date.now,
      domain.name,
      {
        getTelemetryCollector: () => adapter.protocol.telemetry,
      },
    )
    namespaces[name] = {
      act: proxies.act,
      given: proxies.given,
      when: proxies.when,
      query: proxies.query,
      assert: proxies.assert,
      then: proxies.then,
    }
  }

  // Build the context: flat for single adapter, named keys for multi
  let testCtx: any
  if (isMulti) {
    testCtx = { ...namespaces, trace: () => [...trace] }
  } else {
    const [name] = entries[0]
    testCtx = { ...namespaces[name], trace: () => [...trace] }
  }

  // Helper to build metadata for a given entry
  function metadataFor([, domain, adapter]: AdapterEntry) {
    return {
      testName,
      domainName: domain.name,
      adapterName: adapter.protocol.name,
      protocolName: adapter.protocol.name,
    }
  }

  let testBodyFailed = false

  try {
    // ── onTestStart for each adapter ──
    for (const entry of entries) {
      const [name, , adapter] = entry
      await adapter.protocol.onTestStart?.(contexts.get(name), metadataFor(entry))
    }

    // ── Run test body inside AsyncLocalStorage context ──
    // Use the first adapter's protocol info for the ALS context (backward compat).
    const [firstName, firstDomain, firstAdapter] = entries[0]
    const expectGlobal = (globalThis as any).expect
    const testPath = expectGlobal?.getState?.()?.testPath as string | undefined
    await runWithTestContext(
      {
        testName,
        testPath,
        domainName: firstDomain.name,
        protocolName: firstAdapter.protocol.name,
        trace,
        extensions: firstAdapter.protocol.extensions ?? {},
        protocolContext: contexts.get(firstName),
      },
      async () => fn(testCtx),
    )

    // ── End-of-test correlation verification ──
    const hasTelemetry = entries.some(([, , adapter]) => adapter.protocol.telemetry)
    if (hasTelemetry) {
      const mode = resolveTelemetryMode()
      if (mode !== 'off') {
        const result = verifyCorrelation(trace)
        if (result.violations.length > 0) {
          const messages = result.violations.map(v => v.message)
          if (mode === 'fail') {
            throw new Error(`Telemetry correlation failed:\n${messages.join('\n')}`)
          }
          // warn mode: record in trace and emit visible warning
          console.warn(`[aver] Telemetry correlation warning:\n${messages.join('\n')}`)
          trace.push({
            kind: 'test',
            name: 'correlation-warning',
            payload: undefined,
            status: 'pass',
            metadata: { correlationViolations: result.violations },
            correlationId,
          })
        }
      }
    }

    // ── Contract extraction: register passing test traces ──
    if (isExtractionMode()) {
      for (const [, domain] of entries) {
        registerTestResult(domain, testName, trace)
      }
    }

    // ── onTestEnd(pass) for each adapter ──
    for (const entry of entries) {
      const [name, domain, adapter] = entry
      try {
        await adapter.protocol.onTestEnd?.(contexts.get(name), { ...metadataFor(entry), status: 'pass' as const, trace: [...trace] })
      } catch (hookError) {
        trace.push({
          kind: 'test',
          name: 'hook-error:onTestEnd',
          payload: undefined,
          status: 'fail',
          error: hookError,
          correlationId,
          domainName: domain.name,
        })
      }
    }
  } catch (error) {
    testBodyFailed = true

    // ── onTestFail for each adapter — collect attachments ──
    const allAttachments: TraceAttachment[] = []
    for (const entry of entries) {
      const [name, domain, adapter] = entry
      const meta = metadataFor(entry)
      try {
        const result = await adapter.protocol.onTestFail?.(contexts.get(name), { ...meta, status: 'fail' as const, error, trace: [...trace] })
        if (Array.isArray(result)) allAttachments.push(...result)
      } catch (hookError) {
        trace.push({
          kind: 'test',
          name: 'hook-error:onTestFail',
          payload: undefined,
          status: 'fail',
          error: hookError,
          correlationId,
          domainName: domain.name,
        })
      }
    }

    // Push attachments to trace BEFORE onTestEnd so hooks can see them
    if (allAttachments.length > 0) {
      trace.push({
        kind: 'test',
        name: 'failure-artifacts',
        payload: undefined,
        status: 'fail',
        attachments: allAttachments,
        correlationId,
      })
    }

    // ── onTestEnd(fail) for each adapter ──
    for (const entry of entries) {
      const [name, domain, adapter] = entry
      const meta = metadataFor(entry)
      try {
        await adapter.protocol.onTestEnd?.(contexts.get(name), { ...meta, status: 'fail' as const, error, trace: [...trace] })
      } catch (hookError) {
        trace.push({
          kind: 'test',
          name: 'hook-error:onTestEnd',
          payload: undefined,
          status: 'fail',
          error: hookError,
          correlationId,
          domainName: domain.name,
        })
      }
    }

    const protocolNames = [...new Set(entries.map(([, , a]) => a.protocol.name))]
    throw enhanceComposedWithTrace(error, trace, protocolNames)
  } finally {
    // ── Teardown all protocols in reverse order ──
    const reversed = [...entries].reverse()
    for (const entry of reversed) {
      const [name, domain, adapter] = entry
      try {
        await adapter.protocol.teardown(contexts.get(name))
      } catch (teardownError) {
        trace.push({
          kind: 'test',
          name: 'teardown-error',
          payload: undefined,
          status: 'fail',
          error: teardownError,
          correlationId,
          domainName: domain.name,
        })
        // When the test body passed, teardown failures should fail the test
        // (unless configured to only warn). When the test body already failed,
        // we preserve the original error and only record the teardown error in trace.
        if (!testBodyFailed && getTeardownFailureMode() === 'fail') {
          const protocolNames = [...new Set(entries.map(([, , a]) => a.protocol.name))]
          throw enhanceComposedWithTrace(teardownError, trace, protocolNames)
        }
      }
    }
  }
}

/**
 * Backward-compatible single-adapter runner.
 * Delegates to `runTest` with a single-element array.
 */
export async function runTestWithAdapter<D extends Domain>(
  adapter: Adapter,
  domain: D,
  testName: string,
  fn: (ctx: TestContext<D>) => Promise<void>,
  calledOps?: CalledOps,
): Promise<void> {
  const calledOpsMap = calledOps ? new Map([['__single', calledOps]]) : undefined
  return runTest(
    [['__single', domain, adapter]],
    testName,
    fn as (ctx: any) => Promise<void>,
    calledOpsMap,
  )
}
