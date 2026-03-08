import type { TraceEntry } from './trace'

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
 * For correlated groups, verifies:
 * 1. Each matched span carries the expected attribute value (attribute correlation)
 * 2. Matched spans are causally connected — same traceId or linked (causal correlation)
 */
export function verifyCorrelation(trace: ReadonlyArray<TraceEntry>): CorrelationResult {
  // Collect steps that have telemetry with expected attributes
  const stepsWithTelemetry: Array<{
    name: string
    index: number
    expected: Record<string, string | number | boolean>
    matchedSpan?: TraceEntry['telemetry'] extends { matchedSpan?: infer M } ? M : never
  }> = []

  for (let i = 0; i < trace.length; i++) {
    const entry = trace[i]
    if (!entry.telemetry?.expected?.attributes) continue
    if (!entry.telemetry.matched) continue
    stepsWithTelemetry.push({
      name: entry.name,
      index: i,
      expected: entry.telemetry.expected.attributes,
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
      } else if (String(actual) !== String(value)) {
        violations.push({
          kind: 'attribute-mismatch',
          key,
          value,
          steps: steps.map(s => s.name),
          message: `Expected attribute '${key}' = '${value}' on span '${step.matchedSpan.name}' for step '${step.name}' but got '${String(actual)}'`,
        })
      }
    }

    // --- Causal correlation: verify spans are in the same trace or linked ---
    const traceIds = new Set<string>()
    const spanMap = new Map<string, string>() // spanId → traceId for link checking

    for (const step of steps) {
      if (!step.matchedSpan?.traceId) continue
      traceIds.add(step.matchedSpan.traceId)
      if (step.matchedSpan.spanId) {
        spanMap.set(step.matchedSpan.spanId, step.matchedSpan.traceId)
      }
    }

    if (traceIds.size > 1) {
      // Multiple traces — check if linked
      let linked = false
      for (const step of steps) {
        if (!step.matchedSpan?.links) continue
        for (const link of step.matchedSpan.links) {
          // Check if this link points to any span in the correlated group
          if (steps.some(s => s.matchedSpan?.spanId === link.spanId)) {
            linked = true
            break
          }
        }
        if (linked) break
      }

      if (!linked) {
        const traceIdList = [...traceIds]
        const stepNames = steps.map(s => s.name)
        violations.push({
          kind: 'causal-break',
          key,
          value,
          steps: stepNames,
          message: `Steps ${stepNames.join(', ')} share '${key}: ${value}' but spans are in different traces (${traceIdList.join(', ')}) with no link`,
        })
      }
    }
  }

  return { groups, violations }
}
