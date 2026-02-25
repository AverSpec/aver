import { defineDomain, action, query, assertion } from '@aver/core'
import type { AgentEvent } from './types.js'
import type { TuiState, WorkerStatus } from './tui/state.js'

export const AverTui = defineDomain({
  name: 'AverTui',
  actions: {
    dispatchEvent: action<{ event: AgentEvent }>(),
    updateScenarios: action<{ scenarios: Array<{ id: string; stage: string; behavior: string }> }>(),
    receiveQuestion: action<{ id: string; question: string; options?: string[] }>(),
    answerQuestion: action<{ questionId: string }>(),
    changePhase: action<{ phase: TuiState['phase'] }>(),
  },
  queries: {
    phase: query<void, TuiState['phase']>(),
    workerCount: query<void, number>(),
    workersWithStatus: query<{ status: WorkerStatus['status'] }, WorkerStatus[]>(),
    eventCount: query<void, number>(),
    scenarioCount: query<void, number>(),
    implementedCount: query<void, number>(),
    pendingQuestion: query<void, { id: string; question: string; options?: string[] } | undefined>(),
    questionQueueLength: query<void, number>(),
  },
  assertions: {
    phaseIs: assertion<{ phase: TuiState['phase'] }>(),
    hasWorkerWithGoal: assertion<{ goal: string }>(),
    workerStatusIs: assertion<{ goal: string; status: WorkerStatus['status'] }>(),
    hasNoPendingQuestion: assertion<void>(),
    questionTextIs: assertion<{ text: string }>(),
    scenarioCountIs: assertion<{ count: number }>(),
  },
})
