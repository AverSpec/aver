import { defineDomain, action, query, assertion } from '@aver/core'
import type { TelemetryEvent, UncoveredOperation } from '../../../src/types'

export const reconciliation = defineDomain({
  name: 'Reconciliation',
  actions: {
    loadProductionEvents: action<{ events: TelemetryEvent[] }>(),
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
