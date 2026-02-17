import type { Domain } from './domain'
import type { Adapter } from './adapter'
import { findAdapter, findAdapters, getAdapters } from './registry'
import type { TraceEntry, TraceAttachment } from './trace'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runWithTestContext } from './test-context'
import { computeCoverage } from './coverage'
import type { VocabularyCoverage } from './coverage'

interface CalledOps {
  actions: Set<string>
  queries: Set<string>
  assertions: Set<string>
}

export type ActProxy<D extends Domain> = {
  [K in keyof D['vocabulary']['actions']]:
    D['vocabulary']['actions'][K] extends { __payload?: infer P }
      ? [P] extends [void] ? () => Promise<void> : (payload: P) => Promise<void>
      : never
}

export type QueryProxy<D extends Domain> = {
  [K in keyof D['vocabulary']['queries']]:
    D['vocabulary']['queries'][K] extends { __payload?: infer P; __return?: infer R }
      ? [P] extends [void] ? () => Promise<R> : (payload: P) => Promise<R>
      : never
}

export type AssertProxy<D extends Domain> = {
  [K in keyof D['vocabulary']['assertions']]:
    D['vocabulary']['assertions'][K] extends { __payload?: infer P }
      ? [P] extends [void] ? () => Promise<void> : (payload: P) => Promise<void>
      : never
}

export interface TestContext<D extends Domain> {
  act: ActProxy<D>
  query: QueryProxy<D>
  assert: AssertProxy<D>
  trace: () => TraceEntry[]
}

export interface SuiteReturn<D extends Domain> {
  test: (name: string, fn: (ctx: TestContext<D>) => Promise<void>) => void
  it: (name: string, fn: (ctx: TestContext<D>) => Promise<void>) => void
  describe: (name: string, fn: () => void) => void
  context: (name: string, fn: () => void) => void
  /** Programmatic API — for manual lifecycle control (meta-testing, adapter handlers). */
  act: ActProxy<D>
  query: QueryProxy<D>
  assert: AssertProxy<D>
  setup(): Promise<void>
  teardown(): Promise<void>
  getTrace(): TraceEntry[]
  getCoverage(): VocabularyCoverage
}

interface Proxies<D extends Domain> {
  act: ActProxy<D>
  query: QueryProxy<D>
  assert: AssertProxy<D>
}

function createProxies<D extends Domain>(
  domain: D,
  getCtx: () => any,
  getAdapter: () => Adapter,
  trace: TraceEntry[],
  calledOps?: CalledOps,
): Proxies<D> {
  const act: any = {}
  const query: any = {}
  const assert: any = {}

  for (const name of Object.keys(domain.vocabulary.actions)) {
    act[name] = async (payload?: any) => {
      calledOps?.actions.add(name)
      const handler = (getAdapter().handlers.actions as any)[name]
      const entry: TraceEntry = { kind: 'action', name, payload, status: 'pass', startAt: Date.now() }
      try {
        await handler(getCtx(), payload)
      } catch (error) {
        entry.status = 'fail'
        entry.error = error
        throw error
      } finally {
        entry.endAt = Date.now()
        if (entry.startAt !== undefined) entry.durationMs = entry.endAt - entry.startAt
        trace.push(entry)
      }
    }
  }

  for (const name of Object.keys(domain.vocabulary.queries)) {
    query[name] = async (payload?: any) => {
      calledOps?.queries.add(name)
      const handler = (getAdapter().handlers.queries as any)[name]
      const entry: TraceEntry = { kind: 'query', name, payload, status: 'pass', startAt: Date.now() }
      try {
        const result = await handler(getCtx(), payload)
        entry.result = result
        return result
      } catch (error) {
        entry.status = 'fail'
        entry.error = error
        throw error
      } finally {
        entry.endAt = Date.now()
        if (entry.startAt !== undefined) entry.durationMs = entry.endAt - entry.startAt
        trace.push(entry)
      }
    }
  }

  for (const name of Object.keys(domain.vocabulary.assertions)) {
    assert[name] = async (payload?: any) => {
      calledOps?.assertions.add(name)
      const handler = (getAdapter().handlers.assertions as any)[name]
      const entry: TraceEntry = { kind: 'assertion', name, payload, status: 'pass', startAt: Date.now() }
      try {
        await handler(getCtx(), payload)
      } catch (error) {
        entry.status = 'fail'
        entry.error = error
        throw error
      } finally {
        entry.endAt = Date.now()
        if (entry.startAt !== undefined) entry.durationMs = entry.endAt - entry.startAt
        trace.push(entry)
      }
    }
  }

  return { act, query, assert }
}

function formatTrace(trace: TraceEntry[], domainName: string): string {
  return trace
    .map(e => {
      const icon = e.status === 'pass' ? '[PASS]' : '[FAIL]'
      let payloadStr = ''
      if (e.payload !== undefined) {
        try {
          const json = JSON.stringify(e.payload)
          payloadStr = json.length > 60 ? json.substring(0, 57) + '...' : json
        } catch {
          payloadStr = '[unserializable]'
        }
      }
      const errorStr = e.status === 'fail' && e.error
        ? ` — ${(e.error as Error).message ?? e.error}`
        : ''
      return `  ${icon} ${domainName}.${e.name}(${payloadStr})${errorStr}`
    })
    .join('\n')
}

function enhanceWithTrace(error: unknown, trace: TraceEntry[], domain: Domain, protocolName?: string): Error {
  if (trace.length === 0) {
    return error instanceof Error ? error : new Error(String(error))
  }
  const traceStr = formatTrace(trace, domain.name)
  const header = protocolName ? `Action trace (${protocolName}):` : 'Action trace:'
  const enhanced = new Error(
    `${(error as Error).message}\n\n${header}\n${traceStr}`
  )
  enhanced.cause = error
  return enhanced
}

function buildMissingAdapterError(domain: Domain): string {
  const registered = getAdapters()
  if (registered.length === 0) {
    return (
      `No adapter registered for domain "${domain.name}". ` +
      `No adapters are registered. ` +
      `Pass an adapter to suite() or register one via defineConfig().`
    )
  }
  const list = registered
    .map(a => `${a.domain.name} (${a.protocol.name})`)
    .join(', ')
  return (
    `No adapter registered for domain "${domain.name}". ` +
    `Registered: ${list}. ` +
    `Pass an adapter to suite() or register one via defineConfig().`
  )
}

export function suite<D extends Domain>(domain: D, adapter?: Adapter): SuiteReturn<D> {
  // Resolve adapters
  let resolvedAdapters: Adapter[] | undefined
  if (adapter) {
    resolvedAdapters = [adapter]
  }
  // If no adapter provided, defer registry lookup to test time
  // (allows adapters to be registered in config/setup files before tests run)

  function getEffectiveAdapters(): Adapter[] {
    if (resolvedAdapters) return resolvedAdapters

    let adapters = findAdapters(domain)

    // Filter by AVER_ADAPTER env var if set
    const adapterFilter = typeof process !== 'undefined' ? process.env.AVER_ADAPTER : undefined
    if (adapterFilter && adapters.length > 0) {
      adapters = adapters.filter(a => a.protocol.name === adapterFilter)
    }

    return adapters
  }

  // Programmatic API state (uses first/only adapter, lazy resolution)
  let programmaticCtx: any
  const programmaticTrace: TraceEntry[] = []
  let programmaticAdapter: Adapter | undefined = adapter

  function getProgrammaticAdapter(): Adapter {
    if (!programmaticAdapter) {
      programmaticAdapter = findAdapter(domain)
      if (!programmaticAdapter) {
        throw new Error(buildMissingAdapterError(domain))
      }
    }
    return programmaticAdapter
  }

  const globalDescribe = getGlobalDescribe()
  const globalTest = getGlobalTest()
  const globalTestSkip = globalTest?.skip

  // Shared across all tests in this suite. Safe because JS Set.add is atomic
  // within the event loop — concurrent tests interleave promises, not threads.
  const calledOps: CalledOps = { actions: new Set(), queries: new Set(), assertions: new Set() }

  const programmaticProxies = createProxies(
    domain,
    () => programmaticCtx,
    getProgrammaticAdapter,
    programmaticTrace,
    calledOps,
  )

  const testApi = buildTestApi(globalTest, domain, getEffectiveAdapters, globalTestSkip, calledOps)

  return {
    test: testApi,
    it: testApi,
    describe: globalDescribe,
    context: globalDescribe,
    act: programmaticProxies.act,
    query: programmaticProxies.query,
    assert: programmaticProxies.assert,
    setup: async () => {
      const a = getProgrammaticAdapter()
      programmaticCtx = await a.protocol.setup()
      programmaticTrace.length = 0
    },
    teardown: async () => {
      const a = getProgrammaticAdapter()
      await a.protocol.teardown(programmaticCtx)
      programmaticCtx = undefined
    },
    getTrace: () => [...programmaticTrace],
    getCoverage: () => computeCoverage(
      domain.name,
      Object.keys(domain.vocabulary.actions),
      Object.keys(domain.vocabulary.queries),
      Object.keys(domain.vocabulary.assertions),
      calledOps.actions,
      calledOps.queries,
      calledOps.assertions,
    ),
  }
}

async function runTestWithAdapter<D extends Domain>(
  adapter: Adapter,
  domain: D,
  testName: string,
  fn: (ctx: TestContext<D>) => Promise<void>,
  calledOps?: CalledOps,
): Promise<void> {
  const trace: TraceEntry[] = []
  const ctx = await adapter.protocol.setup()
  const proxies = createProxies(domain, () => ctx, () => adapter, trace, calledOps)
  const metadata = {
    testName,
    domainName: domain.name,
    adapterName: adapter.domain.name,
    protocolName: adapter.protocol.name,
  }

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
      async () => fn({ act: proxies.act, query: proxies.query, assert: proxies.assert, trace: () => [...trace] }),
    )
    await adapter.protocol.onTestEnd?.(ctx, { ...metadata, status: 'pass', trace: [...trace] })
  } catch (error) {
    let attachments: TraceAttachment[] | undefined
    try {
      const result = await adapter.protocol.onTestFail?.(ctx, { ...metadata, status: 'fail', error, trace: [...trace] })
      if (Array.isArray(result)) attachments = result
      else if (result && Array.isArray((result as any).attachments)) attachments = (result as any).attachments
    } catch {
      // Ignore hook failures to preserve original error.
    }
    if (attachments && attachments.length > 0) {
      trace.push({
        kind: 'test',
        name: 'failure-artifacts',
        payload: undefined,
        status: 'fail',
        attachments,
      })
    }
    try {
      await adapter.protocol.onTestEnd?.(ctx, { ...metadata, status: 'fail', error, trace: [...trace] })
    } catch {
      // Ignore hook failures to preserve original error.
    }
    throw enhanceWithTrace(error, trace, domain, adapter.protocol.name)
  } finally {
    await adapter.protocol.teardown(ctx)
  }
}

function getGlobalTest(): any {
  return (globalThis as any).test ?? (globalThis as any).it
}

function getGlobalDescribe(): (name: string, fn: () => void) => void {
  const describe = (globalThis as any).describe
  if (typeof describe !== 'function') {
    return () => {
      throw new Error('Aver requires a test runner with describe(). Did you forget to run Vitest or Jest?')
    }
  }
  return describe
}

function buildTestApi<D extends Domain>(
  testImpl: any,
  domain: D,
  getEffectiveAdapters: () => Adapter[],
  globalSkipImpl?: any,
  calledOps?: CalledOps,
): any {
  const api: any = makeTestFn(testImpl, domain, getEffectiveAdapters, globalSkipImpl, calledOps)

  if (!testImpl) return api

  if (typeof testImpl.only === 'function') {
    api.only = makeTestFn(testImpl.only, domain, getEffectiveAdapters, globalSkipImpl, calledOps)
  }
  if (typeof testImpl.skip === 'function') {
    api.skip = makeTestFn(testImpl.skip, domain, getEffectiveAdapters, globalSkipImpl, calledOps)
  }

  if (typeof testImpl.todo === 'function') {
    api.todo = (name: string, fn?: (ctx: TestContext<D>) => Promise<void>) => {
      return (testImpl.todo as any)(name, fn)
    }
  }

  if (typeof testImpl.concurrent === 'function') {
    const concurrentApi: any = makeTestFn(testImpl.concurrent, domain, getEffectiveAdapters, globalSkipImpl, calledOps)
    if (typeof testImpl.concurrent.only === 'function') {
      concurrentApi.only = makeTestFn(testImpl.concurrent.only, domain, getEffectiveAdapters, globalSkipImpl, calledOps)
    }
    if (typeof testImpl.concurrent.skip === 'function') {
      concurrentApi.skip = makeTestFn(testImpl.concurrent.skip, domain, getEffectiveAdapters, globalSkipImpl, calledOps)
    }
    api.concurrent = concurrentApi
  }

  if (typeof testImpl.each === 'function') {
    api.each = (...args: any[]) => {
      const eachImpl = testImpl.each(...args)
      const eachApi: any = makeTestFn(eachImpl, domain, getEffectiveAdapters, globalSkipImpl, calledOps)
      if (typeof eachImpl.only === 'function') {
        eachApi.only = makeTestFn(eachImpl.only, domain, getEffectiveAdapters, globalSkipImpl, calledOps)
      }
      if (typeof eachImpl.skip === 'function') {
        eachApi.skip = makeTestFn(eachImpl.skip, domain, getEffectiveAdapters, globalSkipImpl, calledOps)
      }
      return eachApi
    }
    if (typeof testImpl.each.only === 'function') {
      api.each.only = (...args: any[]) => {
        const eachImpl = testImpl.each.only(...args)
        return makeTestFn(eachImpl, domain, getEffectiveAdapters, globalSkipImpl, calledOps)
      }
    }
    if (typeof testImpl.each.skip === 'function') {
      api.each.skip = (...args: any[]) => {
        const eachImpl = testImpl.each.skip(...args)
        return makeTestFn(eachImpl, domain, getEffectiveAdapters, globalSkipImpl, calledOps)
      }
    }
  }

  return api
}

function makeTestFn<D extends Domain>(
  testImpl: any,
  domain: D,
  getEffectiveAdapters: () => Adapter[],
  globalSkipImpl?: any,
  calledOps?: CalledOps,
): (name: string, fn: (ctx: TestContext<D>) => Promise<void>) => void {
  return (name, fn) => {
    if (!testImpl) {
      throw new Error('Aver requires a test runner. Did you forget to run Vitest or Jest?')
    }

    if (shouldFilterOutDomain(domain)) {
      if (typeof globalSkipImpl === 'function') {
        globalSkipImpl(name, async () => {})
      }
      return
    }

    const adapters = getEffectiveAdapters()

    if (adapters.length === 0) {
      testImpl(name, async () => {
        await maybeAutoloadConfig()
        const a = findAdapter(domain)
        if (!a) throw new Error(buildMissingAdapterError(domain))
        await runTestWithAdapter(a, domain, name, fn, calledOps)
      })
      return
    }

    if (adapters.length === 1) {
      const a = adapters[0]
      testImpl(name, async () => {
        await runTestWithAdapter(a, domain, name, fn, calledOps)
      })
      return
    }

    // Multi-adapter: parameterized test names
    for (const a of adapters) {
      const adapterName = `${name} [${a.protocol.name}]`
      testImpl(adapterName, async () => {
        await runTestWithAdapter(a, domain, adapterName, fn, calledOps)
      })
    }
  }
}

function shouldFilterOutDomain(domain: Domain): boolean {
  if (typeof process === 'undefined') return false
  const filter = process.env.AVER_DOMAIN
  if (!filter) return false
  return filter !== domain.name
}

let configAutoloadAttempted = false
async function maybeAutoloadConfig(): Promise<void> {
  if (configAutoloadAttempted) return
  configAutoloadAttempted = true
  if (typeof process === 'undefined') return
  if (process.env.AVER_AUTOLOAD_CONFIG === 'false') return
  const cwd = process.cwd()
  const filenames = [
    'aver.config.ts',
    'aver.config.js',
    'aver.config.mjs',
    'aver.config.cjs',
  ]
  for (const filename of filenames) {
    const path = join(cwd, filename)
    if (!existsSync(path)) continue
    try {
      await import(pathToFileURL(path).href)
    } catch (error) {
      throw new Error(
        `Found ${filename} but failed to load it. ` +
        `Ensure your test runner can import TypeScript config files.`,
        { cause: error as Error },
      )
    }
    return
  }
}
