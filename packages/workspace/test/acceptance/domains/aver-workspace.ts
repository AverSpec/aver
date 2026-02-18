import { defineDomain, action, query, assertion } from '@aver/core'

export const averWorkspace = defineDomain({
  name: 'AverWorkspace',
  actions: {
    captureScenario: action<{
      behavior: string
      context?: string
      story?: string
      mode?: 'observed' | 'intended'
    }>(),
    advanceScenario: action<{ id: string; rationale: string; promotedBy: string }>(),
    regressScenario: action<{ id: string; targetStage: string; rationale: string }>(),
    addQuestion: action<{ scenarioId: string; text: string }>(),
    resolveQuestion: action<{ scenarioId: string; questionId: string; answer: string }>(),
    linkToDomain: action<{
      scenarioId: string
      domainOperation?: string
      testNames?: string[]
      approvalBaseline?: string
    }>(),
    deleteScenario: action<{ id: string }>(),
    importScenarios: action<{ json: string }>(),
    reloadFromDisk: action(),
  },
  queries: {
    scenario: query<
      { id: string },
      { stage: string; behavior: string; mode?: string } | undefined
    >(),
    scenarios: query<
      { stage?: string; story?: string; keyword?: string } | undefined,
      Array<{ id: string; stage: string; behavior: string }>
    >(),
    summary: query<
      void,
      { captured: number; characterized: number; mapped: number; specified: number; implemented: number; total: number; openQuestions: number }
    >(),
    advanceCandidates: query<void, Array<{ id: string; stage: string }>>(),
    workflowPhase: query<void, string>(),
    exportedMarkdown: query<void, string>(),
    exportedJson: query<void, string>(),
    lastCapturedId: query<void, string>(),
    lastQuestionId: query<void, string>(),
    scenarioCount: query<void, number>(),
  },
  assertions: {
    scenarioHasStage: assertion<{ id: string; stage: string }>(),
    scenarioHasMode: assertion<{ id: string; mode: string }>(),
    scenarioHasPromotedFrom: assertion<{ id: string; stage: string }>(),
    scenarioHasRegressionRationale: assertion<{ id: string; rationale: string }>(),
    scenarioHasDomainOperation: assertion<{ id: string; operation: string }>(),
    scenarioHasTestNames: assertion<{ id: string; names: string[] }>(),
    hasOpenQuestion: assertion<{ id: string; text: string }>(),
    questionIsResolved: assertion<{ scenarioId: string; questionId: string }>(),
    summaryCountIs: assertion<{ stage: string; count: number }>(),
    openQuestionCountIs: assertion<{ count: number }>(),
    workflowPhaseIs: assertion<{ phase: string }>(),
    advanceCandidateCountIs: assertion<{ count: number }>(),
    markdownContains: assertion<{ text: string }>(),
    importResultIs: assertion<{ added: number; skipped: number }>(),
    scenarioSurvivedRoundTrip: assertion<{ id: string; behavior: string }>(),
    scenarioDoesNotExist: assertion<{ id: string }>(),
    throwsError: assertion<{ message: string }>(),
  },
})
