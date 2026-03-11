import type { BehavioralContract, ContractEntry, SpanExpectation, AttributeBinding } from './types'

/** A span from production trace data (OTLP-compatible). */
export interface ProductionSpan {
  readonly name: string
  readonly attributes: Readonly<Record<string, unknown>>
  /** Span identifier for hierarchy matching. */
  readonly spanId?: string
  /** Parent span identifier for hierarchy matching. */
  readonly parentSpanId?: string
}

/** A production trace — a collection of spans from a single request/flow. */
export interface ProductionTrace {
  readonly traceId: string
  readonly spans: readonly ProductionSpan[]
}

/** A single violation found during verification. */
export type Violation =
  | { kind: 'missing-span'; spanName: string; traceId: string }
  | { kind: 'correlation-violation'; symbol: string; paths: Array<{ span: string; attribute: string; value: unknown }>; traceId: string }
  | { kind: 'literal-mismatch'; span: string; attribute: string; expected: string | number | boolean; actual: unknown; traceId: string }

/** Result of verifying a contract entry against a set of production traces. */
export interface EntryVerificationResult {
  readonly testName: string
  readonly tracesMatched: number
  readonly tracesChecked: number
  readonly violations: readonly Violation[]
}

/** Full conformance report for a contract. */
export interface ConformanceReport {
  readonly domain: string
  readonly results: readonly EntryVerificationResult[]
  readonly totalViolations: number
}

/**
 * Verify a behavioral contract against production traces.
 *
 * For each contract entry, finds traces that contain the entry's first span (the "anchor"),
 * then checks all subsequent spans for presence, literal matches, and correlation consistency.
 */
export function verifyContract(
  contract: BehavioralContract,
  traces: readonly ProductionTrace[],
): ConformanceReport {
  const results: EntryVerificationResult[] = []

  for (const entry of contract.entries) {
    results.push(verifyEntry(entry, traces))
  }

  return {
    domain: contract.domain,
    results,
    totalViolations: results.reduce((sum, r) => sum + r.violations.length, 0),
  }
}

/**
 * Find the best matching production span for an expectation, respecting hierarchy
 * constraints and avoiding reuse of already-matched spans.
 */
function findMatchingSpan(
  expectedSpan: SpanExpectation,
  trace: ProductionTrace,
  usedSpanIds: Set<string>,
): ProductionSpan | undefined {
  // Build a spanId → name lookup for parent resolution
  const spanIdToName = new Map<string, string>()
  for (const s of trace.spans) {
    if (s.spanId) spanIdToName.set(s.spanId, s.name)
  }

  const candidates = trace.spans.filter(s => {
    if (s.name !== expectedSpan.name) return false
    // Don't reuse spans that have already been matched (only when spanId is available)
    if (s.spanId && usedSpanIds.has(s.spanId)) return false
    // If parentName constraint is set, verify the parent
    if (expectedSpan.parentName && s.parentSpanId) {
      const actualParentName = spanIdToName.get(s.parentSpanId)
      if (actualParentName !== expectedSpan.parentName) return false
    }
    // If parentName is required but span has no parentSpanId, it can't match
    if (expectedSpan.parentName && !s.parentSpanId) return false
    return true
  })

  return candidates[0]
}

function verifyEntry(
  entry: ContractEntry,
  traces: readonly ProductionTrace[],
): EntryVerificationResult {
  if (entry.spans.length === 0) {
    return { testName: entry.testName, tracesMatched: 0, tracesChecked: 0, violations: [] }
  }

  // Find traces containing the anchor span (first span in the contract entry)
  const anchorName = entry.spans[0].name
  const matchingTraces = traces.filter(t => t.spans.some(s => s.name === anchorName))

  const violations: Violation[] = []

  for (const trace of matchingTraces) {
    // Track which production spans have been matched to avoid reuse
    const usedSpanIds = new Set<string>()
    // Map from expected span index to matched production span
    const matchedSpans = new Map<number, ProductionSpan>()

    // Check each expected span
    for (let i = 0; i < entry.spans.length; i++) {
      const expectedSpan = entry.spans[i]
      const prodSpan = findMatchingSpan(expectedSpan, trace, usedSpanIds)

      if (!prodSpan) {
        violations.push({
          kind: 'missing-span',
          spanName: expectedSpan.name,
          traceId: trace.traceId,
        })
        continue
      }

      // Track this span as used
      if (prodSpan.spanId) usedSpanIds.add(prodSpan.spanId)
      matchedSpans.set(i, prodSpan)

      // Check literal attributes
      for (const [attrKey, binding] of Object.entries(expectedSpan.attributes)) {
        if (binding.kind === 'literal') {
          const actual = prodSpan.attributes[attrKey]
          if (actual !== binding.value) {
            violations.push({
              kind: 'literal-mismatch',
              span: expectedSpan.name,
              attribute: attrKey,
              expected: binding.value,
              actual,
              traceId: trace.traceId,
            })
          }
        }
      }
    }

    // Check correlations — collect all values for each symbol across spans
    const symbolValues = new Map<string, Array<{ span: string; attribute: string; value: unknown }>>()

    for (let i = 0; i < entry.spans.length; i++) {
      const expectedSpan = entry.spans[i]
      const prodSpan = matchedSpans.get(i)
      if (!prodSpan) continue

      for (const [attrKey, binding] of Object.entries(expectedSpan.attributes)) {
        if (binding.kind === 'correlated') {
          const value = prodSpan.attributes[attrKey]
          if (!symbolValues.has(binding.symbol)) {
            symbolValues.set(binding.symbol, [])
          }
          symbolValues.get(binding.symbol)!.push({
            span: expectedSpan.name,
            attribute: attrKey,
            value,
          })
        }
      }
    }

    // For each symbol, all values must be equal
    for (const [symbol, paths] of symbolValues) {
      if (paths.length < 2) continue
      const firstValue = paths[0].value
      const allEqual = paths.every(p => p.value === firstValue)
      if (!allEqual) {
        violations.push({
          kind: 'correlation-violation',
          symbol,
          paths,
          traceId: trace.traceId,
        })
      }
    }
  }

  return {
    testName: entry.testName,
    tracesMatched: matchingTraces.length,
    tracesChecked: traces.length,
    violations,
  }
}
