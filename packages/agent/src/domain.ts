import { defineDomain, action, query, assertion } from '@aver/core'
import type { SupervisorDecision } from './network/agent-network.js'

export const AverAgent = defineDomain({
  name: 'AverAgent',
  actions: {
    startSession: action<{ goal: string }>(),
    resumeSession: action<{ answer: string }>(),
    supervisorWillDecide: action<{ decision: SupervisorDecision; tokenUsage: number }>(),
    workerWillReturn: action<{ response: string; tokenUsage: number }>(),
  },
  queries: {
    sessionStatus: query<void, string | undefined>(),
    sessionGoal: query<void, string | undefined>(),
    activeWorkerCount: query<void, number>(),
    tokenUsage: query<void, { supervisor: number; worker: number }>(),
    lastError: query<void, string | undefined>(),
    humanMessages: query<void, string[]>(),
    scenarioObservations: query<{ scenarioId: string }, string[]>(),
  },
  assertions: {
    sessionIs: assertion<{ status: string }>(),
    sessionStopped: assertion<void>(),
    sessionPaused: assertion<void>(),
    sessionErrored: assertion<{ containing?: string }>(),
    workerWasCreated: assertion<{ goal: string }>(),
    messageReceived: assertion<{ text: string }>(),
  },
})
