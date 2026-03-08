import type { Domain } from './domain'
import type { Adapter } from './adapter'
import type { TraceEntry, TelemetryMatchResult } from './trace'
import type { TelemetryCollector, CollectedSpan } from './protocol'
import type { TelemetryExpectation, VocabMarker } from './types'

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

export type TelemetryVerificationMode = 'warn' | 'fail' | 'off'

function matchSpan(span: CollectedSpan, expected: TelemetryExpectation): boolean {
  if (span.name !== expected.span) return false
  if (!expected.attributes) return true
  for (const [key, value] of Object.entries(expected.attributes)) {
    const actual = span.attributes[key]
    if (typeof value === 'object' && value !== null && 'asymmetricMatch' in value) {
      if (!value.asymmetricMatch(actual)) return false
    } else {
      if (String(actual) !== String(value)) return false
    }
  }
  return true
}

function verifyTelemetry(
  collector: TelemetryCollector,
  expected: TelemetryExpectation,
): TelemetryMatchResult {
  const spans = collector.getSpans()
  const matched = spans.find(s => matchSpan(s, expected))
  return {
    expected: { span: expected.span, attributes: expected.attributes },
    matched: !!matched,
    matchedSpan: matched
      ? { name: matched.name, attributes: { ...matched.attributes } }
      : undefined,
  }
}

function buildKindProxy(
  kind: 'action' | 'query' | 'assertion',
  category: StepCategory,
  markers: Record<string, VocabMarker>,
  names: string[],
  getCtx: () => any,
  getAdapter: () => Adapter,
  trace: TraceEntry[],
  calledOps: CalledOps | undefined,
  correlationId: string | undefined,
  clock: Clock,
  getTelemetryCollector: () => TelemetryCollector | undefined,
  getTelemetryMode: () => TelemetryVerificationMode,
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

        // Telemetry verification: only if step passed, collector is available, and marker declares telemetry
        const marker = markers[name]
        const collector = getTelemetryCollector()
        const mode = getTelemetryMode()
        if (entry.status === 'pass' && collector && marker?.telemetry && mode !== 'off') {
          const expected = typeof marker.telemetry === 'function'
            ? marker.telemetry(payload)
            : marker.telemetry
          const result = verifyTelemetry(collector, expected)
          entry.telemetry = result
          if (!result.matched && mode === 'fail') {
            entry.status = 'fail'
            const err = new Error(
              `Telemetry mismatch: expected span '${expected.span}' not found`
            )
            entry.error = err
            trace.push(entry)
            throw err
          }
        }

        trace.push(entry)
      }
    }
  }

  return proxy
}

export interface ProxyOptions {
  getTelemetryCollector?: () => TelemetryCollector | undefined
  telemetryMode?: TelemetryVerificationMode
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
  options?: ProxyOptions,
): Proxies<D> {
  const actionNames = Object.keys(domain.vocabulary.actions)
  const queryNames = Object.keys(domain.vocabulary.queries)
  const assertionNames = Object.keys(domain.vocabulary.assertions)

  const getTelemetryCollector = options?.getTelemetryCollector ?? (() => undefined)
  const getTelemetryMode = (): TelemetryVerificationMode => {
    if (options?.telemetryMode) return options.telemetryMode
    const envMode = typeof process !== 'undefined' ? process.env.AVER_TELEMETRY_MODE as TelemetryVerificationMode | undefined : undefined
    return envMode ?? (typeof process !== 'undefined' && process.env.CI ? 'fail' : 'warn')
  }

  const args = [getCtx, getAdapter, trace, calledOps, correlationId, clock, getTelemetryCollector, getTelemetryMode, domainName] as const

  const act = buildKindProxy('action', 'act', domain.vocabulary.actions, actionNames, ...args)
  const given = buildKindProxy('action', 'given', domain.vocabulary.actions, actionNames, ...args)
  const when = buildKindProxy('action', 'when', domain.vocabulary.actions, actionNames, ...args)
  const queryProxy = buildKindProxy('query', 'query', domain.vocabulary.queries, queryNames, ...args)
  const assert = buildKindProxy('assertion', 'assert', domain.vocabulary.assertions, assertionNames, ...args)
  const then = buildKindProxy('assertion', 'then', domain.vocabulary.assertions, assertionNames, ...args)

  return { act, given, when, query: queryProxy, assert, then }
}
