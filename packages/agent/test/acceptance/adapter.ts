import { implement } from '@aver/core'
import { createClient, type Client } from '@libsql/client'
import { vi } from 'vitest'
import { AverAgent } from '../../src/domain.js'
import {
  AgentNetwork,
  type Dispatchers,
  type SupervisorDecision,
  type AgentNetworkConfig,
} from '../../src/network/agent-network.js'
import { createDatabase, closeDatabase, AgentStore, SessionStore, EventStore } from '../../src/db/index.js'
import { ObservationStore } from '../../src/db/observation-store.js'
import { WorkspaceStore, initWorkspaceSchema } from '../../src/workspace/storage.js'
import { WorkspaceOps } from '../../src/workspace/operations.js'

// --- Queue-based mock dispatchers ---

interface MockDispatchers extends Dispatchers {
  supervisorDispatch: ReturnType<typeof vi.fn>
  workerDispatch: ReturnType<typeof vi.fn>
}

function createQueuedDispatchers(
  supervisorQueue: Array<{ response: string; tokenUsage: number }>,
  workerQueue: Array<{ response: string; tokenUsage: number }>,
): MockDispatchers {
  const supervisorDispatch = vi.fn(async () => {
    const next = supervisorQueue.shift()
    if (next) return next
    return { response: '{"action":"stop","reason":"no more queued responses"}', tokenUsage: 0 }
  })

  const workerDispatch = vi.fn(async () => {
    const next = workerQueue.shift()
    if (next) return next
    return { response: 'Worker completed the task.', tokenUsage: 50 }
  })

  return { supervisorDispatch, workerDispatch }
}

// --- Test context ---

interface AgentTestContext {
  db: Client
  wsClient: Client
  workspaceOps: WorkspaceOps
  network: AgentNetwork | undefined
  dispatchers: MockDispatchers
  supervisorQueue: Array<{ response: string; tokenUsage: number }>
  workerQueue: Array<{ response: string; tokenUsage: number }>
  messages: string[]
  answerQueue: string[]
  config: AgentNetworkConfig
}

// --- Adapter ---

export const averAgentAdapter = implement(AverAgent, {
  protocol: {
    name: 'unit',
    async setup(): Promise<AgentTestContext> {
      const db = await createDatabase(':memory:')
      const wsClient = createClient({ url: ':memory:' })
      await initWorkspaceSchema(wsClient)
      const store = new WorkspaceStore(wsClient, 'test')
      const workspaceOps = new WorkspaceOps(store)

      const supervisorQueue: Array<{ response: string; tokenUsage: number }> = []
      const workerQueue: Array<{ response: string; tokenUsage: number }> = []
      const dispatchers = createQueuedDispatchers(supervisorQueue, workerQueue)

      return {
        db,
        wsClient,
        workspaceOps,
        network: undefined,
        dispatchers,
        supervisorQueue,
        workerQueue,
        messages: [],
        answerQueue: [],
        config: { maxCycleDepth: 20 },
      }
    },
    async teardown(ctx: AgentTestContext) {
      if (ctx.network) {
        try { await ctx.network.stop() } catch { /* ignore */ }
      }
      closeDatabase(ctx.db)
      ctx.wsClient.close()
    },
  },

  actions: {
    supervisorWillDecide: async (ctx, { decision, tokenUsage }) => {
      ctx.supervisorQueue.push({
        response: JSON.stringify(decision),
        tokenUsage,
      })
    },

    workerWillReturn: async (ctx, { response, tokenUsage }) => {
      ctx.workerQueue.push({ response, tokenUsage })
    },

    startSession: async (ctx, { goal }) => {
      const network = new AgentNetwork(
        ctx.db,
        ctx.dispatchers,
        ctx.workspaceOps,
        ctx.config,
        {
          onMessage: (msg) => ctx.messages.push(msg),
        },
      )
      ctx.network = network
      await network.start(goal)

      // Wait for the async trigger loop to settle
      await vi.waitFor(() => {
        expect(ctx.dispatchers.supervisorDispatch).toHaveBeenCalled()
      }, { timeout: 3000 })

      // Give one more tick for final side effects (stop, worker complete, etc.)
      await new Promise((r) => setTimeout(r, 100))
    },

    startInteractiveSession: async (ctx, { goal, answers }) => {
      ctx.answerQueue = [...answers]
      const network = new AgentNetwork(
        ctx.db,
        ctx.dispatchers,
        ctx.workspaceOps,
        ctx.config,
        {
          onMessage: (msg) => ctx.messages.push(msg),
          onQuestion: async () => {
            const answer = ctx.answerQueue.shift()
            return answer ?? '(no answer queued)'
          },
        },
      )
      ctx.network = network
      await network.start(goal)

      // Wait for the async trigger loop to settle
      await vi.waitFor(() => {
        expect(ctx.dispatchers.supervisorDispatch).toHaveBeenCalled()
      }, { timeout: 3000 })

      // Give one more tick for final side effects (stop, worker complete, etc.)
      await new Promise((r) => setTimeout(r, 100))
    },

    resumeSession: async (ctx, { answer }) => {
      if (!ctx.network) throw new Error('No active network — call startSession first')
      await ctx.network.handleHumanMessage(answer)

      // Wait for supervisor to process the message
      const prevCalls = ctx.dispatchers.supervisorDispatch.mock.calls.length
      await vi.waitFor(() => {
        expect(ctx.dispatchers.supervisorDispatch.mock.calls.length).toBeGreaterThan(prevCalls)
      }, { timeout: 3000 })
      await new Promise((r) => setTimeout(r, 100))
    },
  },

  queries: {
    sessionStatus: async (ctx) => {
      if (!ctx.network?.currentSession) return undefined
      const store = new SessionStore(ctx.db)
      const session = await store.getSession(ctx.network.currentSession.id)
      return session?.status
    },

    sessionGoal: async (ctx) => {
      return ctx.network?.currentSession?.goal
    },

    activeWorkerCount: async (ctx) => {
      const result = await ctx.db.execute({
        sql: "SELECT COUNT(*) as cnt FROM agents WHERE role = 'worker'",
        args: [],
      })
      return Number(result.rows[0].cnt)
    },

    tokenUsage: async (ctx) => {
      if (!ctx.network?.currentSession) return { supervisor: 0, worker: 0 }
      const store = new SessionStore(ctx.db)
      const session = await store.getSession(ctx.network.currentSession.id)
      if (!session) return { supervisor: 0, worker: 0 }
      return { supervisor: session.tokenUsage.supervisor, worker: session.tokenUsage.worker }
    },

    lastError: async (ctx) => {
      const store = new EventStore(ctx.db)
      const events = await store.getEventsByType('error')
      if (events.length === 0) return undefined
      const last = events[events.length - 1]
      return (last.data as { message?: string }).message
    },

    humanMessages: async (ctx) => ctx.messages,

    scenarioObservations: async (ctx, { scenarioId }) => {
      const store = new ObservationStore(ctx.db)
      const obs = await store.getObservations(`scenario:${scenarioId}`)
      return obs.map((o) => o.content)
    },
  },

  assertions: {
    sessionIs: async (ctx, { status }) => {
      if (!ctx.network?.currentSession) {
        throw new Error(`Expected session status "${status}" but no session exists`)
      }
      const store = new SessionStore(ctx.db)
      const session = await store.getSession(ctx.network.currentSession.id)
      if (!session) throw new Error('Session not found in store')
      if (session.status !== status) {
        throw new Error(`Expected session status "${status}" but got "${session.status}"`)
      }
    },

    sessionStopped: async (ctx) => {
      if (!ctx.network) throw new Error('No network — session never started')
      if (!ctx.network.isStopped) {
        throw new Error('Expected session to be stopped but it is still running')
      }
    },

    sessionPaused: async (ctx) => {
      if (!ctx.network?.currentSession) throw new Error('No session')
      const store = new SessionStore(ctx.db)
      const session = await store.getSession(ctx.network.currentSession.id)
      if (session?.status !== 'paused') {
        throw new Error(`Expected session paused but got "${session?.status}"`)
      }
    },

    sessionErrored: async (ctx, { containing }) => {
      if (!ctx.network?.currentSession) throw new Error('No session')
      const store = new SessionStore(ctx.db)
      const session = await store.getSession(ctx.network.currentSession.id)
      if (session?.status !== 'error') {
        throw new Error(`Expected session errored but got "${session?.status}"`)
      }
      if (containing) {
        const eventStore = new EventStore(ctx.db)
        const errors = await eventStore.getEventsByType('error')
        const messages = errors.map((e) => (e.data as { message?: string }).message ?? '')
        const found = messages.some((m) => m.includes(containing))
        if (!found) {
          throw new Error(`Expected error containing "${containing}" but got: ${messages.join('; ')}`)
        }
      }
    },

    workerWasCreated: async (ctx, { goal }) => {
      const result = await ctx.db.execute({
        sql: "SELECT * FROM agents WHERE role = 'worker' AND goal = ?",
        args: [goal],
      })
      if (result.rows.length === 0) {
        throw new Error(`Expected worker with goal "${goal}" but none found`)
      }
    },

    messageReceived: async (ctx, { text }) => {
      const found = ctx.messages.some((m) => m.includes(text))
      if (!found) {
        throw new Error(
          `Expected message containing "${text}" but got: [${ctx.messages.join(', ')}]`,
        )
      }
    },
  },
})
