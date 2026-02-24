import { defineDomain, action, query, assertion } from '@aver/core'
import type { TelemetryEvent, UncoveredOperation, ScenarioRef } from '../../../src/types'

export const reconciliation = defineDomain({
  name: 'Reconciliation',
  actions: {
    loadProductionEvents: action<{ events: TelemetryEvent[] }>(),
    loadScenarios: action<{ scenarios: ScenarioRef[] }>(),
    runReconciliation: action<{ domainName: string }>(),
  },
  queries: {
    uncoveredOperations: query<void, UncoveredOperation[]>(),
    candidateCount: query<void, number>(),
    coveragePercentage: query<void, number>(),
  },
  assertions: {
    noUncoveredOperations: assertion<void>(),
    candidateGenerated: assertion<{ operation: string }>(),
    coverageAbove: assertion<{ threshold: number }>(),
  },
})
