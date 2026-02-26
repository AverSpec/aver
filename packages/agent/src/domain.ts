import { defineDomain, action, query, assertion } from '@aver/core'
import type { SupervisorDecision } from './network/agent-network.js'

export const AverAgent = defineDomain({
  name: 'AverAgent',
  actions: {
    startSession: action<{ goal: string }>(),
    resumeSession: action<{ answer: string }>(),
    queueSupervisorDecision: action<{ decision: SupervisorDecision; tokenUsage: number }>(),
    queueWorkerResponse: action<{ response: string; tokenUsage: number }>(),
  },
  queries: {
    sessionStatus: query<void, string | undefined>(),
    sessionGoal: query<void, string | undefined>(),
    workerCount: query<void, number>(),
    tokenUsage: query<void, { supervisor: number; worker: number }>(),
    lastError: query<void, string | undefined>(),
    messagesReceived: query<void, string[]>(),
    observationContent: query<{ scope: string }, string[]>(),
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
