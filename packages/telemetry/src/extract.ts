import type { Domain } from '@aver/core'
import type { TraceEntry } from '@aver/core'
import type { BehavioralContract, ContractEntry, SpanExpectation, AttributeBinding } from './types'

export interface ExtractContractInput {
  /** The domain to extract from. */
  domain: Domain
  /** Test results: array of { testName, trace } from passing tests. */
  results: Array<{ testName: string; trace: TraceEntry[] }>
}

/**
 * Extract a behavioral contract from test execution traces.
 *
 * For each passing test, walks the trace entries that have telemetry declarations,
 * extracts span expectations, and resolves attribute bindings:
 * - Static TelemetryExpectation → literal bindings
 * - Function TelemetryDeclaration<P> → Proxy-based param field tracking → correlated bindings
 */
export function extractContract(input: ExtractContractInput): BehavioralContract {
  const entries: ContractEntry[] = []

  for (const result of input.results) {
    const spans = extractSpans(input.domain, result.trace)
    if (spans.length > 0) {
      entries.push({ testName: result.testName, spans })
    }
  }

  return { domain: input.domain.name, entries }
}

function extractSpans(domain: Domain, trace: TraceEntry[]): SpanExpectation[] {
  const spans: SpanExpectation[] = []

  // Build a spanId → span name map from matched spans for parent lookups
  const spanIdToName = new Map<string, string>()
  for (const entry of trace) {
    const matched = entry.telemetry?.matchedSpan
    if (matched?.spanId) {
      spanIdToName.set(matched.spanId, matched.name)
    }
  }

  for (const entry of trace) {
    if (!entry.telemetry?.expected) continue

    const expected = entry.telemetry.expected
    const attributes: Record<string, AttributeBinding> = {}

    // Find the marker for this operation to check if telemetry is a function
    const marker = findMarker(domain, entry.kind, entry.name)
    const isParameterized = marker?.telemetry && typeof marker.telemetry === 'function'

    if (isParameterized && entry.payload != null) {
      // Use Proxy to discover which param fields map to which attributes
      const fieldAccesses = trackFieldAccesses(marker.telemetry as Function, entry.payload)

      for (const [attrKey, attrValue] of Object.entries(expected.attributes ?? {})) {
        const paramField = fieldAccesses.get(attrKey)
        if (paramField) {
          attributes[attrKey] = { kind: 'correlated', symbol: `$${paramField}` }
        } else {
          attributes[attrKey] = { kind: 'literal', value: attrValue as string | number | boolean }
        }
      }
    } else {
      // Static declaration — all attributes are literal
      for (const [attrKey, attrValue] of Object.entries(expected.attributes ?? {})) {
        attributes[attrKey] = { kind: 'literal', value: attrValue as string | number | boolean }
      }
    }

    // Resolve parent name from matched span hierarchy
    const matchedSpan = entry.telemetry.matchedSpan
    const parentName = matchedSpan?.parentSpanId
      ? spanIdToName.get(matchedSpan.parentSpanId)
      : undefined

    const expectation: SpanExpectation = { name: expected.span, attributes }
    if (parentName) {
      (expectation as { parentName?: string }).parentName = parentName
    }
    spans.push(expectation)
  }

  return spans
}

function findMarker(domain: Domain, kind: 'action' | 'query' | 'assertion' | 'test', name: string) {
  if (kind === 'action') return domain.vocabulary.actions[name]
  if (kind === 'query') return domain.vocabulary.queries[name]
  if (kind === 'assertion') return domain.vocabulary.assertions[name]
  return undefined
}

/**
 * Run a TelemetryDeclaration<P> function with a Proxy that tracks which
 * payload fields are accessed and maps them to attribute keys.
 *
 * Returns a Map<attributeKey, paramFieldName>.
 */
function trackFieldAccesses(
  telemetryFn: Function,
  payload: unknown,
): Map<string, string> {
  const fieldToSentinel = new Map<string, string>()
  const sentinelToField = new Map<string, string>()

  // Create a Proxy that returns unique sentinel values for each field access
  const proxy = new Proxy(payload as Record<string, unknown>, {
    get(target, prop: string) {
      const sentinel = `__aver_sentinel_${prop}__`
      fieldToSentinel.set(prop, sentinel)
      sentinelToField.set(sentinel, prop)
      return sentinel
    },
  })

  // Call the telemetry function with the proxy
  const result = telemetryFn(proxy)

  // Map attribute keys to param field names via sentinel matching
  const attrToField = new Map<string, string>()
  if (result?.attributes) {
    for (const [attrKey, attrValue] of Object.entries(result.attributes)) {
      const field = sentinelToField.get(attrValue as string)
      if (field) {
        attrToField.set(attrKey, field)
      }
    }

    // Detect sentinel fragments in values that didn't match exactly
    // This indicates computed attributes like `path: '/users/' + p.userId`
    const SENTINEL_PREFIX = '__aver_sentinel_'
    for (const [attrKey, attrValue] of Object.entries(result.attributes)) {
      if (attrToField.has(attrKey)) continue // already matched
      if (typeof attrValue === 'string' && attrValue.includes(SENTINEL_PREFIX)) {
        const match = attrValue.match(/__aver_sentinel_(\w+)__/)
        const field = match ? match[1] : 'unknown'
        console.warn(
          `[aver] Contract extraction: attribute '${attrKey}' uses a computed value from payload field '${field}'. ` +
          `Computed attributes cannot be tracked as correlated — they will be extracted as literal values. ` +
          `Consider using the raw field value directly if correlation is needed.`,
        )
      }
    }
  }

  return attrToField
}
