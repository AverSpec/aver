import type { Domain } from './domain'
import type { Adapter } from './adapter'
import type { TraceEntry, TelemetryMatchResult } from './trace'
import type { TelemetryCollector, CollectedSpan } from './protocol'
import type { TelemetryExpectation, VocabMarker } from './types'
import { parseTelemetryMode } from './telemetry-mode'
import type { TelemetryVerificationMode } from './telemetry-mode'

// Re-export for backward compatibility
export type { TelemetryVerificationMode } from './telemetry-mode'
export { parseTelemetryMode } from './telemetry-mode'

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

function matchSpan(span: CollectedSpan, expected: TelemetryExpectation): boolean {
  if (span.name !== expected.span) return false
  if (!expected.attributes) return true
  for (const [key, value] of Object.entries(expected.attributes)) {
    const actual = span.attributes[key]
    if (typeof value === 'object' && value !== null && 'asymmetricMatch' in value) {
      if (!value.asymmetricMatch(actual)) return false
    } else {
      if (actual !== value) return false
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
      ? {
          name: matched.name,
          attributes: { ...matched.attributes },
          traceId: matched.traceId,
          spanId: matched.spanId,
          parentSpanId: matched.parentSpanId,
          links: matched.links ? [...matched.links] : undefined,
        }
      : undefined,
  }
}

function buildTraceEntry(
  kind: 'action' | 'query' | 'assertion',
  category: StepCategory,
  name: string,
  payload: unknown,
  correlationId: string | undefined,
  domainName: string | undefined,
  clock: Clock,
): TraceEntry {
  return { kind, category, name, payload, status: 'pass', startAt: clock(), correlationId, domainName }
}

function finalizeTraceEntry(entry: TraceEntry, clock: Clock): void {
  entry.endAt = clock()
  if (entry.startAt !== undefined) entry.durationMs = entry.endAt - entry.startAt
}

/**
 * Runs telemetry verification for a step that has passed. Attaches the match
 * result to `entry`. On a mismatch with mode === 'fail', sets entry status to
 * 'fail', pushes the entry to `trace`, and throws — propagating out of the
 * caller's `finally` block so the normal `trace.push` at the end is skipped.
 * On mode === 'warn', emits a console warning and returns normally.
 * No-ops when `marker` has no telemetry declaration or mode === 'off'.
 */
function applyTelemetryVerification(
  entry: TraceEntry,
  payload: unknown,
  marker: VocabMarker | undefined,
  collector: TelemetryCollector,
  mode: TelemetryVerificationMode,
): void {
  if (!marker?.telemetry || mode === 'off') return

  const expected = typeof marker.telemetry === 'function'
    ? marker.telemetry(payload)
    : marker.telemetry
  const result = verifyTelemetry(collector, expected)
  entry.telemetry = result

  if (!result.matched) {
    if (mode === 'fail') {
      entry.status = 'fail'
      const err = new Error(
        `Telemetry mismatch: expected span '${expected.span}' not found`
      )
      entry.error = err
      throw err
    }
    if (mode === 'warn') {
      const attrInfo = expected.attributes
        ? ` with attributes ${JSON.stringify(expected.attributes)}`
        : ''
      const available = collector.getSpans().map(s => s.name)
      console.warn(
        `[aver] Telemetry warning: expected span '${expected.span}'${attrInfo} not found. ` +
        `Available spans: [${available.join(', ')}]`
      )
    }
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
      const entry = buildTraceEntry(kind, category, name, payload, correlationId, domainName, clock)

      try {
        const result = await handler(getCtx(), payload)
        if (kind === 'query') {
          entry.result = result
        }
      } catch (error) {
        entry.status = 'fail'
        entry.error = error
        throw error
      } finally {
        finalizeTraceEntry(entry, clock)
        trace.push(entry)
      }

      // Telemetry verification — only reached when the step passed (catch re-throws).
      const collector = getTelemetryCollector()
      if (collector) {
        applyTelemetryVerification(entry, payload, markers[name], collector, getTelemetryMode())
      }

      return entry.result
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
    const envMode = typeof process !== 'undefined' ? parseTelemetryMode(process.env.AVER_TELEMETRY_MODE) : undefined
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
