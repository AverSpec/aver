import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { implement, unit } from '@aver/core'
import { AverAgent } from '../../src/domain.js'
import { CycleEngine } from '../../src/shell/engine.js'
import type { Dispatchers } from '../../src/shell/engine.js'
import type { SupervisorResult } from '../../src/supervisor/dispatch.js'
import type { WorkerDispatchResult } from '../../src/worker/dispatch.js'
import type {
  SupervisorDecision,
  WorkerResult,
  SupervisorInput,
  WorkerDispatch,
  ArtifactContent,
  AgentConfig,
} from '../../src/types.js'
import { ArtifactStore } from '../../src/memory/artifacts.js'

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
  engine: CycleEngine
  supervisorQueue: QueuedSupervisorResult[]
  workerQueue: QueuedWorkerResult[]
  messages: string[]
}

export const averAgentAdapter = implement(AverAgent, {
  protocol: unit<AgentTestContext>(() => {
    const dir = mkdtempSync(join(tmpdir(), 'aver-agent-test-'))
    const agentPath = join(dir, 'agent')
    const workspacePath = join(dir, 'workspace')

    const supervisorQueue: QueuedSupervisorResult[] = []
    const workerQueue: QueuedWorkerResult[] = []
    const messages: string[] = []

    const dispatchers: Dispatchers = {
      supervisor: async (_input: SupervisorInput, _config: AgentConfig): Promise<SupervisorResult> => {
        const next = supervisorQueue.shift()
        if (!next) {
          return {
            decision: { action: { type: 'stop', reason: 'no queued decision' } },
            tokenUsage: 0,
          }
        }
        return next
      },
      worker: async (_dispatch: WorkerDispatch, _artifacts: ArtifactContent[], _config: AgentConfig, _scenarioDetail?, _projectContext?: string): Promise<WorkerDispatchResult> => {
        const next = workerQueue.shift()
        if (!next) {
          return {
            result: { summary: 'no queued result', artifacts: [], status: 'complete' },
            tokenUsage: 0,
          }
        }
        return next
      },
    }

    const engine = new CycleEngine({
      agentPath,
      workspacePath,
      projectId: 'test',
      config: {
        model: { supervisor: 'mock', worker: 'mock' },
        cycles: { checkpointInterval: 10, rollupThreshold: 3, maxWorkerIterations: 15 },
        dashboard: { port: 4700 },
      },
      dispatchers,
      onMessage: (message: string) => {
        messages.push(message)
      },
    })

    return { dir, engine, supervisorQueue, workerQueue, messages }
  }),

  actions: {
    startSession: async (ctx, { goal }) => {
      await ctx.engine.start(goal)
    },

    resumeSession: async (ctx, { answer }) => {
      await ctx.engine.resume(answer)
    },

    queueSupervisorDecision: async (ctx, { decision, tokenUsage }) => {
      ctx.supervisorQueue.push({ decision, tokenUsage })
    },

    queueWorkerResult: async (ctx, { result, tokenUsage }) => {
      ctx.workerQueue.push({ result, tokenUsage })
    },
  },

  queries: {
    sessionStatus: async (ctx) => {
      const session = await ctx.engine.getSession()
      return session?.status
    },

    sessionGoal: async (ctx) => {
      const session = await ctx.engine.getSession()
      return session?.goal
    },

    cycleCount: async (ctx) => {
      const session = await ctx.engine.getSession()
      return session?.cycleCount ?? 0
    },

    workerCount: async (ctx) => {
      const session = await ctx.engine.getSession()
      return session?.workerCount ?? 0
    },

    tokenUsage: async (ctx) => {
      const session = await ctx.engine.getSession()
      return session?.tokenUsage ?? { supervisor: 0, worker: 0 }
    },

    lastError: async (ctx) => {
      const session = await ctx.engine.getSession()
      return session?.lastError
    },

    artifactNames: async (ctx) => {
      const store = new ArtifactStore(join(ctx.dir, 'agent'))
      const index = await store.getIndex()
      return index.map(a => a.name)
    },

    artifactContent: async (ctx, { name }) => {
      const artifact = await ctx.engine.readArtifact(name)
      return artifact?.content
    },

    messagesReceived: async (ctx) => {
      return ctx.messages
    },
  },

  assertions: {
    sessionIs: async (ctx, { status }) => {
      const session = await ctx.engine.getSession()
      const actual = session?.status
      if (actual !== status) {
        throw new Error(`Expected session status "${status}" but got "${actual}"`)
      }
    },

    sessionStopped: async (ctx) => {
      const session = await ctx.engine.getSession()
      if (session?.status !== 'stopped') {
        throw new Error(`Expected session to be stopped but got "${session?.status}"`)
      }
    },

    sessionPaused: async (ctx) => {
      const session = await ctx.engine.getSession()
      if (session?.status !== 'paused') {
        throw new Error(`Expected session to be paused but got "${session?.status}"`)
      }
    },

    sessionErrored: async (ctx, params) => {
      const session = await ctx.engine.getSession()
      if (session?.status !== 'error') {
        throw new Error(`Expected session to be in error state but got "${session?.status}"`)
      }
      if (params?.containing && session.lastError) {
        if (!session.lastError.includes(params.containing)) {
          throw new Error(
            `Expected error containing "${params.containing}" but got "${session.lastError}"`,
          )
        }
      }
    },

    artifactExists: async (ctx, { name }) => {
      const artifact = await ctx.engine.readArtifact(name)
      if (!artifact) {
        throw new Error(`Expected artifact "${name}" to exist but it was not found`)
      }
    },

    messageReceived: async (ctx, { text }) => {
      if (!ctx.messages.includes(text)) {
        throw new Error(
          `Expected message "${text}" but received: [${ctx.messages.map(m => `"${m}"`).join(', ')}]`,
        )
      }
    },
  },
})
