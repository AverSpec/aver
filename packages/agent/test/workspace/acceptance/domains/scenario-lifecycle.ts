import { defineDomain, action, query, assertion } from '@aver/core'

export const scenarioLifecycle = defineDomain({
  name: 'ScenarioLifecycle',
  actions: {
    captureScenario: action<{ behavior: string; context?: string; story?: string; mode?: string }>(),
    updateScenario: action<{ behavior?: string; rules?: string[] }>(),
    revisitScenario: action<{ targetStage: string; rationale: string }>(),
    advanceScenario: action<{ rationale: string; promotedBy: string }>(),
    confirmScenario: action<{ confirmer: string }>(),
    linkToDomain: action<{ domainOperation?: string; testNames?: string[] }>(),
  },
  queries: {
    scenarioStage: query<void, string>(),
    scenarioMode: query<void, string>(),
    scenarioBehavior: query<void, string>(),
    scenarioRuleCount: query<void, number>(),
    scenarioConfirmation: query<void, string | null>(),
    domainOperation: query<void, string | undefined>(),
  },
  assertions: {
    scenarioCreated: assertion(),
    modeIs: assertion<{ mode: string }>(),
    behaviorIs: assertion<{ behavior: string }>(),
    stageIs: assertion<{ stage: string }>(),
    stageUnchanged: assertion<{ stage: string }>(),
    rulesReplaced: assertion<{ count: number }>(),
    confirmationCleared: assertion(),
    confirmationPresent: assertion<{ confirmer: string }>(),
    linksCleared: assertion(),
    transitionRecorded: assertion<{ from: string; to: string }>(),
    operationFailed: assertion<{ message: string }>(),
  },
})
