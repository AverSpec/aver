import type { Domain } from './domain'
import type { Adapter } from './adapter'
import type { TraceEntry } from './trace'

export interface CalledOps {
  actions: Set<string>
  queries: Set<string>
  assertions: Set<string>
}

export type StepCategory = 'given' | 'when' | 'act' | 'query' | 'then' | 'assert'

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

export interface Proxies<D extends Domain> {
  act: ActProxy<D>
  /** Alias for `act` — narrative clarity for setup steps. */
  given: ActProxy<D>
  /** Alias for `act` — narrative clarity for trigger steps. */
  when: ActProxy<D>
  query: QueryProxy<D>
  assert: AssertProxy<D>
  /** Alias for `assert` — narrative clarity for verification steps. */
  then: AssertProxy<D>
}

export type Clock = () => number

function buildKindProxy(
  kind: 'action' | 'query' | 'assertion',
  category: StepCategory,
  names: string[],
  getCtx: () => any,
  getAdapter: () => Adapter,
  trace: TraceEntry[],
  calledOps: CalledOps | undefined,
  correlationId: string | undefined,
  clock: Clock,
  domainName?: string,
): any {
  const proxy: any = {}

  for (const name of names) {
    proxy[name] = async (payload?: any) => {
      if (kind === 'action') calledOps?.actions.add(name)
      else if (kind === 'query') calledOps?.queries.add(name)
      else calledOps?.assertions.add(name)

      const handlers = kind === 'action'
        ? getAdapter().handlers.actions
        : kind === 'query'
          ? getAdapter().handlers.queries
          : getAdapter().handlers.assertions

      const handler = (handlers as any)[name]
      const entry: TraceEntry = { kind, category, name, payload, status: 'pass', startAt: clock(), correlationId, domainName }

      try {
        const result = await handler(getCtx(), payload)
        if (kind === 'query') {
          entry.result = result
          return result
        }
      } catch (error) {
        entry.status = 'fail'
        entry.error = error
        throw error
      } finally {
        entry.endAt = clock()
        if (entry.startAt !== undefined) entry.durationMs = entry.endAt - entry.startAt
        trace.push(entry)
      }
    }
  }

  return proxy
}

export function createProxies<D extends Domain>(
  domain: D,
  getCtx: () => any,
  getAdapter: () => Adapter,
  trace: TraceEntry[],
  calledOps?: CalledOps,
  correlationId?: string,
  clock: Clock = Date.now,
  domainName?: string,
): Proxies<D> {
  const actionNames = Object.keys(domain.vocabulary.actions)
  const queryNames = Object.keys(domain.vocabulary.queries)
  const assertionNames = Object.keys(domain.vocabulary.assertions)

  const args = [getCtx, getAdapter, trace, calledOps, correlationId, clock, domainName] as const

  const act = buildKindProxy('action', 'act', actionNames, ...args)
  const given = buildKindProxy('action', 'given', actionNames, ...args)
  const when = buildKindProxy('action', 'when', actionNames, ...args)
  const queryProxy = buildKindProxy('query', 'query', queryNames, ...args)
  const assert = buildKindProxy('assertion', 'assert', assertionNames, ...args)
  const then = buildKindProxy('assertion', 'then', assertionNames, ...args)

  return { act, given, when, query: queryProxy, assert, then }
}
