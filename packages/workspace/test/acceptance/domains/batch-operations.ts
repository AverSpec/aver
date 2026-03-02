import { defineDomain, action, query, assertion } from '@aver/core'

export const batchOperations = defineDomain({
  name: 'BatchOperations',
  actions: {
    captureScenario: action<{ behavior: string; context?: string; story?: string }>(),
    advanceSingle: action<{ index: number; rationale: string; promotedBy: string }>(),
    confirmScenario: action<{ index: number; confirmer: string }>(),
    addQuestion: action<{ index: number; text: string }>(),
    batchAdvance: action<{ rationale: string; promotedBy: string }>(),
    batchRevisit: action<{ targetStage: string; rationale: string }>(),
  },
  queries: {
    advancedCount: query<void, number>(),
    blockedCount: query<void, number>(),
    errorCount: query<void, number>(),
    revisitedCount: query<void, number>(),
  },
  assertions: {
    scenarioAtStage: assertion<{ index: number; stage: string }>(),
    resultStatus: assertion<{ index: number; status: string }>(),
    advanceSummaryIs: assertion<{ advanced: number; blocked: number; errors: number }>(),
    revisitSummaryIs: assertion<{ revisited: number; errors: number }>(),
  },
})
