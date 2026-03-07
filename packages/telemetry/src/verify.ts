import type { BehavioralContract, ContractEntry, SpanExpectation, AttributeBinding } from './types'

/** A span from production trace data (OTLP-compatible). */
export interface ProductionSpan {
  readonly name: string
  readonly attributes: Readonly<Record<string, unknown>>
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
    // Check each expected span
    for (const expectedSpan of entry.spans) {
      const prodSpan = trace.spans.find(s => s.name === expectedSpan.name)

      if (!prodSpan) {
        violations.push({
          kind: 'missing-span',
          spanName: expectedSpan.name,
          traceId: trace.traceId,
        })
        continue
      }

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

    for (const expectedSpan of entry.spans) {
      const prodSpan = trace.spans.find(s => s.name === expectedSpan.name)
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
