import { randomUUID } from 'node:crypto'
import type { Domain } from './domain'
import type { Adapter } from './adapter'
import type { TraceEntry } from './trace'
import type { ActProxy, QueryProxy, AssertProxy, CalledOps } from './proxy'
import { createProxies } from './proxy'
import { getGlobalTest, getGlobalDescribe } from './test-registration'
import { enhanceComposedWithTrace } from './trace-format'

type DomainAdapterPair = readonly [Domain, Adapter]
type ComposeConfig = Record<string, DomainAdapterPair>

type DomainContext<D extends Domain> = {
  act: ActProxy<D>
  given: ActProxy<D>
  when: ActProxy<D>
  query: QueryProxy<D>
  assert: AssertProxy<D>
  then: AssertProxy<D>
}

export type ComposedTestContext<C extends ComposeConfig> = {
  [K in keyof C]: C[K] extends readonly [infer D extends Domain, any]
    ? DomainContext<D> : never
} & { trace: () => TraceEntry[] }

type ComposedTestFn<C extends ComposeConfig> =
  ((name: string, fn: (ctx: ComposedTestContext<C>) => Promise<void>) => void)

export interface ComposeReturn<C extends ComposeConfig> {
  test: ComposedTestFn<C>
  it: ComposedTestFn<C>
  describe: (name: string, fn: () => void) => void
}

function shouldFilterOutComposed(config: ComposeConfig): boolean {
  if (typeof process === 'undefined') return false
  const filter = process.env.AVER_DOMAIN
  if (!filter) return false
  return !Object.values(config).some(([domain]) => domain.name === filter)
}

async function runComposedTest<C extends ComposeConfig>(
  config: C,
  testName: string,
  fn: (ctx: ComposedTestContext<C>) => Promise<void>,
  calledOpsMap: Map<string, CalledOps>,
): Promise<void> {
  const trace: TraceEntry[] = []
  const correlationId = randomUUID()
  const entries = Object.entries(config)

  // Setup all protocols — track which succeeded for partial teardown
  const contexts = new Map<string, any>()
  for (const [key, [, adapter]] of entries) {
    try {
      const ctx = await adapter.protocol.setup()
      contexts.set(key, ctx)
    } catch (setupError) {
      // Teardown already-setup protocols in reverse
      const setupKeys = [...contexts.keys()].reverse()
      for (const k of setupKeys) {
        try {
          const [, a] = config[k]
          await a.protocol.teardown(contexts.get(k))
        } catch {
          // swallow teardown errors during partial cleanup
        }
      }
      throw setupError
    }
  }

  // Build per-domain proxies, all sharing the same trace array
  const namespaces: Record<string, any> = {}
  for (const [key, [domain, adapter]] of entries) {
    const calledOps = calledOpsMap.get(key)
    const proxies = createProxies(
      domain,
      () => contexts.get(key),
      () => adapter,
      trace,
      calledOps,
      correlationId,
      Date.now,
      domain.name,
    )
    namespaces[key] = {
      act: proxies.act,
      given: proxies.given,
      when: proxies.when,
      query: proxies.query,
      assert: proxies.assert,
      then: proxies.then,
    }
  }

  const ctx = {
    ...namespaces,
    trace: () => [...trace],
  } as ComposedTestContext<C>

  try {
    // onTestStart for each domain
    for (const [key, [domain, adapter]] of entries) {
      const meta = {
        testName,
        domainName: domain.name,
        adapterName: adapter.domain.name,
        protocolName: adapter.protocol.name,
      }
      await adapter.protocol.onTestStart?.(contexts.get(key), meta)
    }

    await fn(ctx)

    // onTestEnd(pass) for each domain
    for (const [key, [domain, adapter]] of entries) {
      const meta = {
        testName,
        domainName: domain.name,
        adapterName: adapter.domain.name,
        protocolName: adapter.protocol.name,
      }
      try {
        await adapter.protocol.onTestEnd?.(contexts.get(key), { ...meta, status: 'pass', trace: [...trace] })
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
    // onTestFail + onTestEnd(fail) for each domain
    for (const [key, [domain, adapter]] of entries) {
      const meta = {
        testName,
        domainName: domain.name,
        adapterName: adapter.domain.name,
        protocolName: adapter.protocol.name,
      }
      try {
        await adapter.protocol.onTestFail?.(contexts.get(key), { ...meta, status: 'fail', error, trace: [...trace] })
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
      try {
        await adapter.protocol.onTestEnd?.(contexts.get(key), { ...meta, status: 'fail', error, trace: [...trace] })
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

    const protocolNames = [...new Set(entries.map(([, [, a]]) => a.protocol.name))]
    throw enhanceComposedWithTrace(error, trace, protocolNames)
  } finally {
    // Teardown all protocols in reverse order
    const reversed = [...entries].reverse()
    for (const [key, [domain, adapter]] of reversed) {
      try {
        await adapter.protocol.teardown(contexts.get(key))
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
      }
    }
  }
}

function buildComposedTestApi<C extends ComposeConfig>(
  testImpl: any,
  config: C,
  globalSkipImpl: any,
  calledOpsMap: Map<string, CalledOps>,
): ComposedTestFn<C> {
  const base: ComposedTestFn<C> = (name, fn) => {
    if (!testImpl) {
      throw new Error('Aver requires a test runner. Did you forget to run Vitest or Jest?')
    }

    if (shouldFilterOutComposed(config)) {
      if (typeof globalSkipImpl === 'function') {
        globalSkipImpl(name, async () => {})
      }
      return
    }

    testImpl(name, async () => {
      await runComposedTest(config, name, fn, calledOpsMap)
    })
  }

  if (!testImpl) return base

  return new Proxy(base, {
    get(_, prop) {
      const child = testImpl[prop]
      if (child === undefined) return undefined

      if (prop === 'todo') return child.bind(testImpl)

      if (prop === 'each') {
        return (...args: any[]) =>
          buildComposedTestApi(testImpl.each(...args), config, globalSkipImpl, calledOpsMap)
      }

      if (typeof child === 'function') {
        return buildComposedTestApi(child, config, globalSkipImpl, calledOpsMap)
      }

      return child
    },
  }) as ComposedTestFn<C>
}

export function compose<C extends ComposeConfig>(config: C): ComposeReturn<C> {
  const globalTest = getGlobalTest()
  const globalSkipImpl = globalTest?.skip
  const globalDescribe = getGlobalDescribe()

  const calledOpsMap = new Map<string, CalledOps>()
  for (const key of Object.keys(config)) {
    calledOpsMap.set(key, { actions: new Set(), queries: new Set(), assertions: new Set() })
  }

  const testApi = buildComposedTestApi(globalTest, config, globalSkipImpl, calledOpsMap)

  return {
    test: testApi,
    it: testApi,
    describe: globalDescribe,
  }
}
