import type { Domain } from './domain'
import type { Adapter } from './adapter'
import type { TraceEntry } from './trace'

export interface CalledOps {
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

export interface Proxies<D extends Domain> {
  act: ActProxy<D>
  query: QueryProxy<D>
  assert: AssertProxy<D>
}

export function createProxies<D extends Domain>(
  domain: D,
  getCtx: () => any,
  getAdapter: () => Adapter,
  trace: TraceEntry[],
  calledOps?: CalledOps,
  correlationId?: string,
): Proxies<D> {
  const act: any = {}
  const query: any = {}
  const assert: any = {}

  for (const name of Object.keys(domain.vocabulary.actions)) {
    act[name] = async (payload?: any) => {
      calledOps?.actions.add(name)
      const handler = (getAdapter().handlers.actions as any)[name]
      const entry: TraceEntry = { kind: 'action', name, payload, status: 'pass', startAt: Date.now(), correlationId }
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
      const entry: TraceEntry = { kind: 'query', name, payload, status: 'pass', startAt: Date.now(), correlationId }
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
      const entry: TraceEntry = { kind: 'assertion', name, payload, status: 'pass', startAt: Date.now(), correlationId }
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
