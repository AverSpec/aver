import { defineDomain, action, query, assertion } from '@aver/core'

export const scenarioQuerying = defineDomain({
  name: 'ScenarioQuerying',
  actions: {
    captureScenario: action<{ behavior: string; context?: string; story?: string }>(),
    advanceScenario: action<{ rationale: string; promotedBy: string }>(),
    confirmScenario: action<{ confirmer: string }>(),
    addQuestion: action<{ text: string }>(),
    resolveQuestion: action<{ answer: string }>(),
    linkToDomain: action<{ domainOperation: string }>(),
  },
  queries: {
    summaryCount: query<{ stage: string }, number>(),
    scenariosByFilter: query<{ stage?: string; keyword?: string; story?: string }, number>(),
    advanceCandidateCount: query<void, number>(),
  },
  assertions: {
    stageCountIs: assertion<{ stage: string; count: number }>(),
    filterReturns: assertion<{ count: number }>(),
    advanceCandidatesAre: assertion<{ count: number }>(),
  },
})
