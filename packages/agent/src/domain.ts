import { defineDomain, action, query, assertion } from '@aver/core'
import type { SupervisorDecision, WorkerResult } from './types.js'

export const AverAgent = defineDomain({
  name: 'AverAgent',
  actions: {
    startSession: action<{ goal: string }>(),
    resumeSession: action<{ answer: string }>(),
    queueSupervisorDecision: action<{ decision: SupervisorDecision; tokenUsage: number }>(),
    queueWorkerResult: action<{ result: WorkerResult; tokenUsage: number }>(),
  },
  queries: {
    sessionStatus: query<void, string | undefined>(),
    sessionGoal: query<void, string | undefined>(),
    cycleCount: query<void, number>(),
    workerCount: query<void, number>(),
    tokenUsage: query<void, { supervisor: number; worker: number }>(),
    lastError: query<void, string | undefined>(),
    artifactNames: query<void, string[]>(),
    artifactContent: query<{ name: string }, string | undefined>(),
    messagesReceived: query<void, string[]>(),
  },
  assertions: {
    sessionIs: assertion<{ status: string }>(),
    sessionStopped: assertion<void>(),
    sessionPaused: assertion<void>(),
    sessionErrored: assertion<{ containing?: string }>(),
    artifactExists: assertion<{ name: string }>(),
    messageReceived: assertion<{ text: string }>(),
  },
})
