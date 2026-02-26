// TODO: rewrite adapter to use AgentNetwork (Task 21)
// CycleEngine was deleted in Task 16 — this adapter is temporarily stubbed.

import { implement, unit } from '@aver/core'
import { AverAgent } from '../../src/domain.js'
import type {
  SupervisorDecision,
  WorkerResult,
  ArtifactContent,
  AgentConfig,
} from '../../src/types.js'

interface QueuedSupervisorResult {
  decision: SupervisorDecision
  tokenUsage: number
}

interface QueuedWorkerResult {
  result: WorkerResult
  tokenUsage: number
}

interface AgentTestContext {
  dir: string
  supervisorQueue: QueuedSupervisorResult[]
  workerQueue: QueuedWorkerResult[]
  messages: string[]
}

export const averAgentAdapter = implement(AverAgent, {
  protocol: unit<AgentTestContext>(() => {
    return {
      dir: '',
      supervisorQueue: [],
      workerQueue: [],
      messages: [],
    }
  }),

  actions: {
    startSession: async (_ctx, { goal: _goal }) => {
      throw new Error('TODO: wire to AgentNetwork (Task 21)')
    },

    resumeSession: async (_ctx, { answer: _answer }) => {
      throw new Error('TODO: wire to AgentNetwork (Task 21)')
    },

    queueSupervisorDecision: async (ctx, { decision, tokenUsage }) => {
      ctx.supervisorQueue.push({ decision, tokenUsage })
    },

    queueWorkerResult: async (ctx, { result, tokenUsage }) => {
      ctx.workerQueue.push({ result, tokenUsage })
    },
  },

  queries: {
    sessionStatus: async () => undefined,
    sessionGoal: async () => undefined,
    cycleCount: async () => 0,
    workerCount: async () => 0,
    tokenUsage: async () => ({ supervisor: 0, worker: 0 }),
    lastError: async () => undefined,
    artifactNames: async () => [],
    artifactContent: async () => undefined,
    messagesReceived: async (ctx) => ctx.messages,
  },

  assertions: {
    sessionIs: async () => {
      throw new Error('TODO: wire to AgentNetwork (Task 21)')
    },
    sessionStopped: async () => {
      throw new Error('TODO: wire to AgentNetwork (Task 21)')
    },
    sessionPaused: async () => {
      throw new Error('TODO: wire to AgentNetwork (Task 21)')
    },
    sessionErrored: async () => {
      throw new Error('TODO: wire to AgentNetwork (Task 21)')
    },
    artifactExists: async () => {
      throw new Error('TODO: wire to AgentNetwork (Task 21)')
    },
    messageReceived: async () => {
      throw new Error('TODO: wire to AgentNetwork (Task 21)')
    },
  },
})
