import { randomUUID } from 'node:crypto'
import type { Domain } from './domain'
import type { Adapter } from './adapter'
import { findAdapter, findAdapters } from './registry'
import type { TraceEntry } from './trace'
import { computeCoverage, registerCoverageEnforcement } from './coverage'
import type { VocabularyCoverage } from './coverage'
import { createProxies } from './proxy'
import type { CalledOps, ActProxy, QueryProxy, AssertProxy } from './proxy'
import { getGlobalTest, getGlobalDescribe, buildTestApi, shouldFilterOutDomain, buildMissingAdapterError } from './test-registration'
import { runTest } from './test-runner'
import type { AdapterEntry } from './test-runner'


export type { ActProxy, QueryProxy, AssertProxy } from './proxy'

export interface TestContext<D extends Domain> {
  act: ActProxy<D>
  /** Alias for `act` — narrative clarity for setup steps. */
  given: ActProxy<D>
  /** Alias for `act` — narrative clarity for trigger steps. */
  when: ActProxy<D>
  query: QueryProxy<D>
  assert: AssertProxy<D>
  /** Alias for `assert` — narrative clarity for verification steps. */
  then: AssertProxy<D>
  trace: () => TraceEntry[]
}

export interface PlannedTest {
  name: string
  status: 'register' | 'skip'
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

/** Internal-only extension — available from '@averspec/core/internals'. */
export interface SuiteInternals {
  /** Returns what test names would be registered for a given test name. */
  getPlannedTests(name: string): PlannedTest[]
}

// ── Named config types ──

export type SuiteConfig = Record<string, readonly [Domain, Adapter]>

export type NamedContext<D extends Domain> = {
  act: ActProxy<D>
  given: ActProxy<D>
  when: ActProxy<D>
  query: QueryProxy<D>
  assert: AssertProxy<D>
  then: AssertProxy<D>
}

export type NamedTestContext<C extends SuiteConfig> = {
  [K in keyof C]: C[K] extends readonly [infer D extends Domain, any]
    ? NamedContext<D> : never
} & { trace: () => TraceEntry[] }

type NamedTestFn<C extends SuiteConfig> =
  ((name: string, fn: (ctx: NamedTestContext<C>) => Promise<void>) => void)

export interface NamedSuiteReturn<C extends SuiteConfig> {
  test: NamedTestFn<C>
  it: NamedTestFn<C>
  describe: (name: string, fn: () => void) => void
  context: (name: string, fn: () => void) => void
}

// ── Overload signatures ──

export function suite<C extends SuiteConfig>(config: C): NamedSuiteReturn<C>
export function suite<D extends Domain>(domain: D, adapter?: Adapter): SuiteReturn<D>
export function suite(domainOrConfig: any, adapter?: Adapter): any {
  // Detection: Domain has 'vocabulary', config record does not
  if (domainOrConfig && typeof domainOrConfig === 'object' && 'vocabulary' in domainOrConfig) {
    return suiteSingle(domainOrConfig, adapter)
  }
  return suiteConfig(domainOrConfig)
}

// ── Named config implementation ──

function shouldFilterOutConfig(config: SuiteConfig): boolean {
  if (typeof process === 'undefined') return false
  const filter = process.env.AVER_DOMAIN
  if (!filter) return false
  return !Object.values(config).some(([domain]) => domain.name === filter)
}

/**
 * Wraps a test runner's `test` function for the named config (multi-domain) variant.
 * Mirrors buildTestApi's Proxy pattern — see test-registration.ts for full documentation.
 */
function buildNamedTestApi<C extends SuiteConfig>(
  testImpl: any,
  config: C,
  globalSkipImpl: any,
  calledOpsMap: Map<string, CalledOps>,
): NamedTestFn<C> {
  const base: NamedTestFn<C> = (name, fn) => {
    if (!testImpl) {
      throw new Error('Aver requires a test runner. Did you forget to run Vitest or Jest?')
    }

    if (shouldFilterOutConfig(config)) {
      if (typeof globalSkipImpl === 'function') {
        globalSkipImpl(name, async () => {})
      }
      return
    }

    const entries: AdapterEntry[] = Object.entries(config).map(
      ([key, [domain, adapter]]) => [key, domain, adapter],
    )

    testImpl(name, async () => {
      await runTest(entries, name, fn as (ctx: any) => Promise<void>, calledOpsMap)
    })
  }

  if (!testImpl) return base

  return new Proxy(base, {
    get(_, prop) {
      const child = testImpl[prop]
      if (child === undefined) return undefined

      if (prop === 'todo') return child.bind(testImpl)

      if (prop === 'each' || prop === 'for') {
        return (...args: any[]) =>
          buildNamedTestApi(testImpl[prop](...args), config, globalSkipImpl, calledOpsMap)
      }

      if (prop === 'skipIf' || prop === 'runIf') {
        return (...args: any[]) =>
          buildNamedTestApi(child.call(testImpl, ...args), config, globalSkipImpl, calledOpsMap)
      }

      if (typeof child === 'function') {
        return buildNamedTestApi(child, config, globalSkipImpl, calledOpsMap)
      }

      return child
    },
  }) as NamedTestFn<C>
}

function suiteConfig<C extends SuiteConfig>(config: C): NamedSuiteReturn<C> {
  const globalTest = getGlobalTest()
  const globalSkipImpl = globalTest?.skip
  const globalDescribe = getGlobalDescribe()

  const calledOpsMap = new Map<string, CalledOps>()
  for (const key of Object.keys(config)) {
    calledOpsMap.set(key, { actions: new Set(), queries: new Set(), assertions: new Set() })
  }

  const testApi = buildNamedTestApi(globalTest, config, globalSkipImpl, calledOpsMap)

  return {
    test: testApi,
    it: testApi,
    describe: globalDescribe,
    context: globalDescribe,
  }
}

// ── Single domain implementation ──

function suiteSingle<D extends Domain>(domain: D, adapter?: Adapter): SuiteReturn<D> & SuiteInternals {
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

  const correlationId = randomUUID()

  // Register afterAll coverage enforcement if a threshold is configured.
  registerCoverageEnforcement(domain, calledOps)

  const programmaticProxies = createProxies(
    domain,
    () => programmaticCtx,
    getProgrammaticAdapter,
    programmaticTrace,
    calledOps,
    correlationId,
    Date.now,
    undefined,
    {
      getTelemetryCollector: () => getProgrammaticAdapter().protocol.telemetry,
    },
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
    getPlannedTests: (name: string): PlannedTest[] => {
      if (shouldFilterOutDomain(domain)) {
        return [{ name, status: 'skip' }]
      }
      const adapters = getEffectiveAdapters()
      if (adapters.length <= 1) {
        return [{ name, status: 'register' }]
      }
      return adapters.map(a => ({
        name: `${name} [${a.protocol.name}]`,
        status: 'register' as const,
      }))
    },
  }
}
