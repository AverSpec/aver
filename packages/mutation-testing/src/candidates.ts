import type { SurvivedMutant } from './engine-types.js'

export interface RefinementCandidate {
  source: 'mutation-testing'
  mutantId: string
  behavior: string
  context: string
  suggestedStage: 'captured'
}

/**
 * Generate spec refinement candidates from survived mutants.
 * Each survivor indicates a gap in test coverage that should be addressed.
 */
export function generateCandidates(survivors: SurvivedMutant[]): RefinementCandidate[] {
  return survivors.map(s => ({
    source: 'mutation-testing' as const,
    mutantId: s.id,
    behavior: describeSurvivor(s),
    context: describeContext(s),
    suggestedStage: 'captured' as const,
  }))
}

function describeSurvivor(s: SurvivedMutant): string {
  if (s.source === 'adapter') {
    return `Adapter mutation survived: ${s.operatorName} on ${s.handlerKind}.${s.handlerName}`
  }
  return `Implementation mutation survived: ${s.operatorName} — ${s.description}`
}

function describeContext(s: SurvivedMutant): string {
  if (s.location) {
    return `${s.location.file}:${s.location.startLine}`
  }
  if (s.handlerKind && s.handlerName) {
    return `${s.handlerKind} handler: ${s.handlerName}`
  }
  return 'unknown location'
}
