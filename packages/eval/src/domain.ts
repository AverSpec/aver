import { defineDomain, action, query, assertion } from '@aver/core'
import type { Stage, Scenario } from '@aver/agent'
import type { WorkerResult, ArtifactType } from '@aver/agent'

export const agentEval = defineDomain({
  name: 'AgentEval',
  actions: {
    seedScenario: action<{
      behavior: string
      stage: Stage
      context?: string
      rules?: string[]
      seams?: string[]
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
  },
})
