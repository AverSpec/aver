import type { Domain } from './domain'
import type { Adapter } from './adapter'
import { findAdapter, findAdapters, getAdapters } from './registry'

export interface TraceEntry {
  kind: 'action' | 'query' | 'assertion'
  name: string
  payload: unknown
  status: 'pass' | 'fail'
  result?: unknown
  error?: unknown
}

export type ActProxy<D extends Domain> = {
  [K in keyof D['vocabulary']['actions']]:
    D['vocabulary']['actions'][K] extends { __payload?: infer P }
      ? [P] extends [void] ? () => Promise<void> : (payload: P) => Promise<void>
      : never
}

export type QueryProxy<D extends Domain> = {
  [K in keyof D['vocabulary']['queries']]:
    D['vocabulary']['queries'][K] extends { __return?: infer R }
      ? () => Promise<R>
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
  /** Programmatic API — for manual lifecycle control (meta-testing, adapter handlers). */
  act: ActProxy<D>
  query: QueryProxy<D>
  assert: AssertProxy<D>
  setup(): Promise<void>
  teardown(): Promise<void>
  getTrace(): TraceEntry[]
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
): Proxies<D> {
  const act: any = {}
  const query: any = {}
  const assert: any = {}

  for (const name of Object.keys(domain.vocabulary.actions)) {
    act[name] = async (payload?: any) => {
      const a = getAdapter()
      const entry: TraceEntry = { kind: 'action', name, payload, status: 'pass' }
      try {
        if (payload !== undefined) {
          await (a.handlers.actions as any)[name](getCtx(), payload)
        } else {
          await (a.handlers.actions as any)[name](getCtx())
        }
      } catch (error) {
        entry.status = 'fail'
        entry.error = error
        throw error
      } finally {
        trace.push(entry)
      }
    }
  }

  for (const name of Object.keys(domain.vocabulary.queries)) {
    query[name] = async () => {
      const a = getAdapter()
      const entry: TraceEntry = { kind: 'query', name, payload: undefined, status: 'pass' }
      try {
        const result = await (a.handlers.queries as any)[name](getCtx())
        entry.result = result
        return result
      } catch (error) {
        entry.status = 'fail'
        entry.error = error
        throw error
      } finally {
        trace.push(entry)
      }
    }
  }

  for (const name of Object.keys(domain.vocabulary.assertions)) {
    assert[name] = async (payload?: any) => {
      const a = getAdapter()
      const entry: TraceEntry = { kind: 'assertion', name, payload, status: 'pass' }
      try {
        if (payload !== undefined) {
          await (a.handlers.assertions as any)[name](getCtx(), payload)
        } else {
          await (a.handlers.assertions as any)[name](getCtx())
        }
      } catch (error) {
        entry.status = 'fail'
        entry.error = error
        throw error
      } finally {
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
        const json = JSON.stringify(e.payload)
        payloadStr = json.length > 60 ? json.substring(0, 57) + '...' : json
      }
      const errorStr = e.status === 'fail' && e.error
        ? ` — ${(e.error as Error).message ?? e.error}`
        : ''
      return `  ${icon} ${domainName}.${e.name}(${payloadStr})${errorStr}`
    })
    .join('\n')
}

function enhanceWithTrace(error: unknown, trace: TraceEntry[], domain: Domain): Error {
  if (trace.length === 0) {
    return error instanceof Error ? error : new Error(String(error))
  }
  const traceStr = formatTrace(trace, domain.name)
  const enhanced = new Error(
    `${(error as Error).message}\n\nAction trace:\n${traceStr}`
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

  const programmaticProxies = createProxies(
    domain,
    () => programmaticCtx,
    getProgrammaticAdapter,
    programmaticTrace,
  )

  function testFn(name: string, fn: (ctx: TestContext<D>) => Promise<void>): void {
    const vitestTest = (globalThis as any).test
    if (!vitestTest) return

    const adapters = getEffectiveAdapters()

    if (adapters.length === 0) {
      // Deferred: register a test that resolves adapter at runtime
      vitestTest(name, async () => {
        const a = findAdapter(domain)
        if (!a) throw new Error(buildMissingAdapterError(domain))
        await runTestWithAdapter(a, domain, name, fn)
      })
      return
    }

    if (adapters.length === 1) {
      const a = adapters[0]
      vitestTest(name, async () => {
        await runTestWithAdapter(a, domain, name, fn)
      })
      return
    }

    // Multi-adapter: parameterized test names
    for (const a of adapters) {
      vitestTest(`${name} [${a.protocol.name}]`, async () => {
        await runTestWithAdapter(a, domain, name, fn)
      })
    }
  }

  return {
    test: testFn,
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
  }
}

async function runTestWithAdapter<D extends Domain>(
  adapter: Adapter,
  domain: D,
  _name: string,
  fn: (ctx: TestContext<D>) => Promise<void>,
): Promise<void> {
  const trace: TraceEntry[] = []
  const ctx = await adapter.protocol.setup()
  const proxies = createProxies(domain, () => ctx, () => adapter, trace)

  try {
    await fn({ act: proxies.act, query: proxies.query, assert: proxies.assert, trace: () => [...trace] })
  } catch (error) {
    throw enhanceWithTrace(error, trace, domain)
  } finally {
    await adapter.protocol.teardown(ctx)
  }
}
