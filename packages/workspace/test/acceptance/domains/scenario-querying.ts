import { defineDomain, action, query, assertion } from '@aver/core'

export const scenarioQuerying = defineDomain({
  name: 'ScenarioQuerying',
  actions: {
    captureScenario: action<{ behavior: string; context?: string; story?: string; mode?: 'observed' | 'intended' }>(),
    advanceScenario: action<{ rationale: string; promotedBy: string }>(),
    confirmScenario: action<{ confirmer: string }>(),
    addQuestion: action<{ text: string }>(),
    resolveQuestion: action<{ answer: string }>(),
    linkToDomain: action<{ domainOperation: string }>(),
  },
  queries: {
    summaryCount: query<{ stage: string }, number>(),
    summaryOpenQuestions: query<void, number>(),
    scenariosByFilter: query<{
      stage?: string
      keyword?: string
      story?: string
      mode?: 'observed' | 'intended'
      hasConfirmation?: boolean
      domainOperation?: string
      hasOpenQuestions?: boolean
      createdAfter?: string
      createdBefore?: string
      fields?: string[]
    }, number>(),
    lastProjectedKeys: query<void, string>(),
    advanceCandidateCount: query<void, number>(),
  },
  assertions: {
    stageCountIs: assertion<{ stage: string; count: number }>(),
    filterReturns: assertion<{ count: number }>(),
    openQuestionsCountIs: assertion<{ count: number }>(),
    projectedKeysAre: assertion<{ keys: string }>(),
    advanceCandidatesAre: assertion<{ count: number }>(),
  },
})
