import { defineDomain, action, query, assertion } from '@aver/core'

export const workflowPhaseDetection = defineDomain({
  name: 'WorkflowPhaseDetection',
  actions: {
    captureScenario: action<{ behavior: string }>(),
    advanceScenario: action<{ rationale: string; promotedBy: string }>(),
    confirmScenario: action<{ confirmer: string }>(),
    linkToDomain: action<{ domainOperation: string }>(),
  },
  queries: {
    workflowPhase: query<void, string>(),
  },
  assertions: {
    phaseIs: assertion<{ phase: string }>(),
  },
})
