import type { TraceEntry, TelemetryMatchResult } from './trace'

export interface CorrelationGroup {
  key: string
  value: string
  steps: Array<{ name: string; index: number }>
}

export interface CorrelationViolation {
  kind: 'attribute-mismatch' | 'causal-break'
  key: string
  value: string
  steps: string[]
  message: string
}

export interface CorrelationResult {
  groups: CorrelationGroup[]
  violations: CorrelationViolation[]
}

/**
 * Verify cross-step telemetry correlation after all steps complete.
 *
 * Scans trace entries for steps with telemetry match results.
 * Groups steps by shared (attribute key, expected value) pairs.
 *
 * Two verification levels:
 * 1. Attribute correlation (default) — each matched span carries the expected attribute value
 * 2. Causal correlation (opt-in via `causes`) — spans are in the same trace or linked
 *
 * Causal checking only fires when a step's telemetry declaration includes `causes: [...]`,
 * naming the target spans that should be trace-connected. Separate HTTP requests that share
 * an attribute but have no causal relationship are not flagged.
 */
export function verifyCorrelation(trace: ReadonlyArray<TraceEntry>): CorrelationResult {
  // Collect steps that have telemetry with expected attributes
  const stepsWithTelemetry: Array<{
    name: string
    index: number
    expected: Record<string, unknown>
    causes?: readonly string[]
    matchedSpan?: TelemetryMatchResult['matchedSpan']
  }> = []

  for (let i = 0; i < trace.length; i++) {
    const entry = trace[i]
    if (!entry.telemetry?.expected?.attributes) continue
    if (!entry.telemetry.matched) continue
    stepsWithTelemetry.push({
      name: entry.name,
      index: i,
      expected: entry.telemetry.expected.attributes,
      causes: entry.telemetry.expected.causes,
      matchedSpan: entry.telemetry.matchedSpan,
    })
  }

  // Group by shared (attribute key, expected value)
  const keyValueMap = new Map<string, Array<typeof stepsWithTelemetry[number]>>()

  for (const step of stepsWithTelemetry) {
    for (const [key, value] of Object.entries(step.expected)) {
      const compositeKey = `${key}=${String(value)}`
      let group = keyValueMap.get(compositeKey)
      if (!group) {
        group = []
        keyValueMap.set(compositeKey, group)
      }
      group.push(step)
    }
  }

  const groups: CorrelationGroup[] = []
  const violations: CorrelationViolation[] = []

  for (const [compositeKey, steps] of keyValueMap) {
    // Only check groups with 2+ steps (correlation requires at least a pair)
    if (steps.length < 2) continue

    const [key, ...valueParts] = compositeKey.split('=')
    const value = valueParts.join('=')

    groups.push({
      key,
      value,
      steps: steps.map(s => ({ name: s.name, index: s.index })),
    })

    // --- Attribute correlation: verify each matched span carries the attribute ---
    for (const step of steps) {
      if (!step.matchedSpan) {
        violations.push({
          kind: 'attribute-mismatch',
          key,
          value,
          steps: steps.map(s => s.name),
          message: `Expected attribute '${key}' on span for step '${step.name}' but span was not matched`,
        })
        continue
      }

      const actual = step.matchedSpan.attributes[key]
      if (actual === undefined) {
        violations.push({
          kind: 'attribute-mismatch',
          key,
          value,
          steps: steps.map(s => s.name),
          message: `Expected attribute '${key}' on span '${step.matchedSpan.name}' for step '${step.name}' but not found`,
        })
      } else if (actual !== value) {
        violations.push({
          kind: 'attribute-mismatch',
          key,
          value,
          steps: steps.map(s => s.name),
          message: `Expected attribute '${key}' = '${value}' on span '${step.matchedSpan.name}' for step '${step.name}' but got '${String(actual)}'`,
        })
      }
    }

    // --- Causal correlation: only when a step declares `causes` ---
    for (const step of steps) {
      if (!step.causes || step.causes.length === 0) continue
      if (!step.matchedSpan?.traceId) continue

      for (const targetSpanName of step.causes) {
        // Find the target step in this correlation group
        const target = steps.find(s => s.matchedSpan?.name === targetSpanName)
        if (!target?.matchedSpan?.traceId) continue

        // Same trace — causally connected
        if (step.matchedSpan.traceId === target.matchedSpan.traceId) continue

        // Different trace — check for span links
        let linked = false

        // Check if target links back to source
        if (target.matchedSpan.links) {
          for (const link of target.matchedSpan.links) {
            if (link.spanId === step.matchedSpan.spanId) {
              linked = true
              break
            }
          }
        }

        // Check if source links to target
        if (!linked && step.matchedSpan.links) {
          for (const link of step.matchedSpan.links) {
            if (link.spanId === target.matchedSpan.spanId) {
              linked = true
              break
            }
          }
        }

        if (!linked) {
          violations.push({
            kind: 'causal-break',
            key,
            value,
            steps: [step.name, targetSpanName],
            message: `'${step.matchedSpan.name}' declares causes: ['${targetSpanName}'] but spans are in different traces (${step.matchedSpan.traceId}, ${target.matchedSpan.traceId}) with no link. Propagate trace context or add a span link at the async boundary.`,
          })
        }
      }
    }
  }

  return { groups, violations }
}
