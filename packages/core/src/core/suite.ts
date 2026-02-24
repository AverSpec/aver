import { randomUUID } from 'node:crypto'
import type { Domain } from './domain'
import type { Adapter } from './adapter'
import { findAdapter, findAdapters } from './registry'
import type { TraceEntry } from './trace'
import { computeCoverage } from './coverage'
import type { VocabularyCoverage } from './coverage'
import { createProxies } from './proxy'
import type { CalledOps, ActProxy, QueryProxy, AssertProxy } from './proxy'
import { getGlobalTest, getGlobalDescribe, buildTestApi, shouldFilterOutDomain, buildMissingAdapterError } from './test-registration'

export type { ActProxy, QueryProxy, AssertProxy } from './proxy'

export interface TestContext<D extends Domain> {
  act: ActProxy<D>
  query: QueryProxy<D>
  assert: AssertProxy<D>
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
  /** Returns what test names would be registered for a given test name. */
  getPlannedTests(name: string): PlannedTest[]
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

  const correlationId = randomUUID()

  const programmaticProxies = createProxies(
    domain,
    () => programmaticCtx,
    getProgrammaticAdapter,
    programmaticTrace,
    calledOps,
    correlationId,
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
