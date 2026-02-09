import type { Domain } from './domain'
import type { Adapter } from './adapter'
import { _findAdapter } from './registry'

export interface TraceEntry {
  kind: 'action' | 'query' | 'assertion'
  name: string
  payload: unknown
  status: 'pass' | 'fail'
  result?: unknown
  error?: unknown
}

export interface Suite<D extends Domain> {
  test: (name: string, fn: () => Promise<void>) => void
  domain: DomainProxy<D>
  _setupForTest(): Promise<void>
  _teardownForTest(): Promise<void>
  _getTrace(): TraceEntry[]
}

type DomainProxy<D extends Domain> = {
  [K in keyof D['vocabulary']['actions']]:
    D['vocabulary']['actions'][K] extends { __payload?: infer P }
      ? P extends void ? () => Promise<void> : (payload: P) => Promise<void>
      : never
} & {
  [K in keyof D['vocabulary']['queries']]:
    D['vocabulary']['queries'][K] extends { __return?: infer R }
      ? () => Promise<R>
      : never
} & {
  [K in keyof D['vocabulary']['assertions']]:
    D['vocabulary']['assertions'][K] extends { __payload?: infer P }
      ? P extends void ? () => Promise<void> : (payload: P) => Promise<void>
      : never
}

export function suite<D extends Domain>(domain: D): Suite<D> {
  let adapter: Adapter | undefined
  let ctx: any
  const trace: TraceEntry[] = []

  function resolveAdapter(): Adapter {
    if (!adapter) {
      adapter = _findAdapter(domain)
      if (!adapter) {
        throw new Error(`No adapter registered for domain "${domain.name}"`)
      }
    }
    return adapter
  }

  async function setup(): Promise<void> {
    const a = resolveAdapter()
    ctx = await a.protocol.setup()
    trace.length = 0
  }

  async function teardown(): Promise<void> {
    const a = resolveAdapter()
    await a.protocol.teardown(ctx)
    ctx = undefined
  }

  function createProxy(): DomainProxy<D> {
    const proxy: any = {}

    for (const name of Object.keys(domain.vocabulary.actions)) {
      proxy[name] = async (payload?: any) => {
        const a = resolveAdapter()
        const entry: TraceEntry = { kind: 'action', name, payload, status: 'pass' }
        try {
          if (payload !== undefined) {
            await (a.handlers.actions as any)[name](ctx, payload)
          } else {
            await (a.handlers.actions as any)[name](ctx)
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
      proxy[name] = async () => {
        const a = resolveAdapter()
        const entry: TraceEntry = { kind: 'query', name, payload: undefined, status: 'pass' }
        try {
          const result = await (a.handlers.queries as any)[name](ctx)
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
      proxy[name] = async (payload?: any) => {
        const a = resolveAdapter()
        const entry: TraceEntry = { kind: 'assertion', name, payload, status: 'pass' }
        try {
          if (payload !== undefined) {
            await (a.handlers.assertions as any)[name](ctx, payload)
          } else {
            await (a.handlers.assertions as any)[name](ctx)
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

    return proxy
  }

  const domainProxy = createProxy()

  return {
    test: (name: string, fn: () => Promise<void>) => {
      if (typeof (globalThis as any).test === 'function') {
        (globalThis as any).test(name, async () => {
          trace.length = 0
          try {
            await fn()
          } catch (error) {
            const traceStr = trace
              .map(e => `  ${domain.name}.${e.name}(${e.payload ? JSON.stringify(e.payload) : ''})  ${e.status === 'pass' ? '\u2713' : '\u2717'}`)
              .join('\n')
            const enhanced = new Error(
              `${(error as Error).message}\n\nAction trace:\n${traceStr}`
            )
            enhanced.cause = error
            throw enhanced
          }
        })
      }
    },
    domain: domainProxy,
    _setupForTest: setup,
    _teardownForTest: teardown,
    _getTrace: () => [...trace],
  }
}
