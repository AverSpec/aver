import { defineDomain, action, query, assertion } from '@aver/core'
import type { Stage, Scenario, Seam } from '../../../../src/workspace/types.js'
import type { WorkerResult, ArtifactType } from '../../../../src/types.js'

export const agentEval = defineDomain({
  name: 'AgentEval',
  actions: {
    seedScenario: action<{
      behavior: string
      stage: Stage
      context?: string
      rules?: string[]
      seams?: Seam[]
    }>(),
    queueWorkerResult: action<{
      summary: string
      artifacts?: Array<{
        type: ArtifactType
        name: string
        summary: string
        content: string
      }>
    }>(),
    runWorker: action<{
      skill: string
      goal: string
      artifacts?: string[]
    }>(),
    runPipeline: action<{
      goal: string
      maxCycles?: number
    }>(),
  },
  queries: {
    workerOutput: query<void, WorkerResult>(),
    scenarioAfter: query<void, Scenario>(),
    tokenCost: query<void, number>(),
  },
  assertions: {
    scenarioAdvancedTo: assertion<{ stage: Stage }>(),
    outputContainsArtifact: assertion<{ type: ArtifactType }>(),
    withinTokenBudget: assertion<{ max: number }>(),
    outputMeetsRubric: assertion<{ rubric: string }>(),
    scenarioStageIs: assertion<{ stage: Stage }>(),
    scenarioBehaviorIs: assertion<{ behavior: string }>(),
    workerSummaryIs: assertion<{ summary: string }>(),
    artifactCountIs: assertion<{ count: number }>(),
  },
})
