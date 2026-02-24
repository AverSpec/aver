import type { UncoveredOperation, CandidateScenario, TelemetryEvent } from './types.js'

export function generateCandidates(
  uncovered: UncoveredOperation[],
  events: TelemetryEvent[],
): CandidateScenario[] {
  return uncovered.map(op => {
    const relatedEvents = events.filter(e => e.operation === op.operation).slice(0, 5)
    const confidence = op.eventCount >= 10 ? 'high' : op.eventCount >= 3 ? 'medium' : 'low'

    return {
      source: 'production-reconciliation' as const,
      deviation: 'uncovered-operation' as const,
      behavior: `Production ${op.kind} "${op.operation}" has no scenario coverage (seen ${op.eventCount} times)`,
      evidence: {
        operations: relatedEvents,
        eventCount: op.eventCount,
      },
      suggestedStage: 'captured' as const,
      confidence,
    }
  })
}
