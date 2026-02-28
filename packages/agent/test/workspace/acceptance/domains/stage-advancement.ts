import { defineDomain, action, query, assertion } from '@aver/core'

export const stageAdvancement = defineDomain({
  name: 'StageAdvancement',
  actions: {
    captureScenario: action<{ behavior: string }>(),
    confirmScenario: action<{ confirmer: string }>(),
    advanceScenario: action<{ rationale: string; promotedBy: string }>(),
    revisitScenario: action<{ targetStage: string; rationale: string }>(),
    addQuestion: action<{ text: string }>(),
    resolveQuestion: action<{ answer: string }>(),
    linkToDomain: action<{ domainOperation?: string; testNames?: string[] }>(),
  },
  queries: {
    scenarioStage: query<void, string>(),
    scenarioConfirmation: query<void, string | null>(),
    openQuestionCount: query<void, number>(),
    domainLinks: query<void, { domainOperation?: string; testNames: string[] }>(),
  },
  assertions: {
    scenarioIsAt: assertion<{ stage: string }>(),
    advancementBlocked: assertion<{ reason: string }>(),
    advancementSucceeded: assertion<{ to: string }>(),
    confirmationCleared: assertion(),
    confirmationIs: assertion<{ confirmer: string }>(),
    transitionRecorded: assertion<{ from: string; to: string; by: string }>(),
    domainLinksAre: assertion<{ domainOperation?: string; testNames?: string[] }>(),
    operationFailed: assertion<{ message: string }>(),
  },
})
