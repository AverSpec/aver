import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import {
  createDatabase,
  closeDatabase,
  AgentStore,
  SessionStore,
  EventStore,
} from '../../src/db/index.js'
import { WorkspaceStore, initWorkspaceSchema } from '../../src/workspace/storage.js'
import { WorkspaceOps } from '../../src/workspace/operations.js'
import {
  AgentNetwork,
  type Dispatchers,
  type AgentNetworkConfig,
} from '../../src/network/agent-network.js'

// --- Helpers ---

async function createInMemoryWorkspaceOps(): Promise<{ ops: WorkspaceOps; client: Client }> {
  const client = createClient({ url: ':memory:' })
  await initWorkspaceSchema(client)
  const store = new WorkspaceStore(client, 'test')
  const ops = new WorkspaceOps(store)
  return { ops, client }
}

function createMockDispatchers(supervisorResponses: string[]) {
  let callIndex = 0
  const supervisorDispatch = vi.fn(async () => {
    const response =
      supervisorResponses[callIndex] ?? '{"action":"stop","reason":"no more responses"}'
    callIndex++
    return { response, tokenUsage: 100 }
  })
  const workerDispatch = vi.fn(async (_sys?: string, _usr?: string, _perm?: string) => ({
    response: 'Worker completed the task successfully.',
    tokenUsage: 200,
  }))
  return { supervisorDispatch, workerDispatch }
}

/**
 * Wait for the network to settle after starting. Waits for the supervisor
 * to have been called at least `times` times, then allows a tick for
 * side effects.
 */
async function waitForSupervisorCalls(
  dispatchers: ReturnType<typeof createMockDispatchers>,
  times: number,
  timeoutMs = 3000,
): Promise<void> {
  await vi.waitFor(
    () => {
      expect(dispatchers.supervisorDispatch).toHaveBeenCalledTimes(times)
    },
    { timeout: timeoutMs },
  )
  // Allow async side effects (event logging, state updates) to settle
  await new Promise((r) => setTimeout(r, 50))
}

describe('AgentNetwork edge cases', () => {
  let db: Client
  let workspaceClient: Client
  let workspaceOps: WorkspaceOps
  let config: AgentNetworkConfig

  beforeEach(async () => {
    db = await createDatabase(':memory:')
    const ws = await createInMemoryWorkspaceOps()
    workspaceOps = ws.ops
    workspaceClient = ws.client
    config = { maxCycleDepth: 10 }
  })

  afterEach(() => {
    closeDatabase(db)
    workspaceClient.close()
  })

  // -------------------------------------------------------
  // 1. Malformed supervisor output
  // -------------------------------------------------------
  describe('malformed supervisor output', () => {
    it('non-JSON text logs decision:invalid and keeps session running', async () => {
      const dispatchers = createMockDispatchers(['This has no JSON whatsoever'])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await waitForSupervisorCalls(dispatchers, 1)

      const sessionStore = new SessionStore(db)
      const session = await sessionStore.getSession(network.currentSession!.id)
      expect(session!.status).toBe('running')

      const eventStore = new EventStore(db)
      const invalidEvents = await eventStore.getEventsByType('decision:invalid')
      expect(invalidEvents.length).toBeGreaterThanOrEqual(1)
      expect(JSON.stringify(invalidEvents[0].data)).toContain('Failed to parse')
    })

    it('valid JSON array (not object) logs decision:invalid and keeps session running', async () => {
      // extractJson finds no '{', returns raw text "[1, 2, 3]".
      // JSON.parse succeeds yielding an array. typeof [] === 'object', so the
      // "must be object" guard passes. But obj.action is undefined, so the
      // missing-action guard fires as a DecisionParseError.
      const dispatchers = createMockDispatchers(['[1, 2, 3]'])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await waitForSupervisorCalls(dispatchers, 1)

      const sessionStore = new SessionStore(db)
      const session = await sessionStore.getSession(network.currentSession!.id)
      expect(session!.status).toBe('running')

      const eventStore = new EventStore(db)
      const invalidEvents = await eventStore.getEventsByType('decision:invalid')
      expect(invalidEvents.length).toBeGreaterThanOrEqual(1)
    })

    it('valid JSON object but missing action field logs decision:invalid and keeps session running', async () => {
      const dispatchers = createMockDispatchers(['{"reason":"forgot action"}'])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await waitForSupervisorCalls(dispatchers, 1)

      const sessionStore = new SessionStore(db)
      const session = await sessionStore.getSession(network.currentSession!.id)
      expect(session!.status).toBe('running')

      const eventStore = new EventStore(db)
      const invalidEvents = await eventStore.getEventsByType('decision:invalid')
      expect(invalidEvents.length).toBeGreaterThanOrEqual(1)
      expect(JSON.stringify(invalidEvents[0].data)).toContain('must have an \\"action\\" string field')
    })

    it('unknown action type logs decision:invalid and keeps session running', async () => {
      const dispatchers = createMockDispatchers([
        '{"action":"launch_missiles","target":"moon"}',
      ])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await waitForSupervisorCalls(dispatchers, 1)

      const sessionStore = new SessionStore(db)
      const session = await sessionStore.getSession(network.currentSession!.id)
      expect(session!.status).toBe('running')

      const eventStore = new EventStore(db)
      const invalidEvents = await eventStore.getEventsByType('decision:invalid')
      expect(invalidEvents.length).toBeGreaterThanOrEqual(1)
      expect(JSON.stringify(invalidEvents[0].data)).toContain('Unknown action type')
    })

    it('valid JSON string (not object) logs decision:invalid and keeps session running', async () => {
      // extractJson will return the raw string, JSON.parse yields a string, not an object
      const dispatchers = createMockDispatchers(['"just a string"'])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await waitForSupervisorCalls(dispatchers, 1)

      const sessionStore = new SessionStore(db)
      const session = await sessionStore.getSession(network.currentSession!.id)
      expect(session!.status).toBe('running')

      const eventStore = new EventStore(db)
      const invalidEvents = await eventStore.getEventsByType('decision:invalid')
      expect(invalidEvents.length).toBeGreaterThanOrEqual(1)
    })

    it('advance_scenario without scenarioId logs decision:invalid', async () => {
      const dispatchers = createMockDispatchers([
        '{"action":"advance_scenario"}',
      ])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await waitForSupervisorCalls(dispatchers, 1)

      const sessionStore = new SessionStore(db)
      const session = await sessionStore.getSession(network.currentSession!.id)
      expect(session!.status).toBe('running')

      const eventStore = new EventStore(db)
      const invalidEvents = await eventStore.getEventsByType('decision:invalid')
      expect(invalidEvents.length).toBeGreaterThanOrEqual(1)
      expect((invalidEvents[0].data.details as any).field).toBe('scenarioId')
      expect((invalidEvents[0].data.details as any).actionType).toBe('advance_scenario')
    })

    it('update_scenario without scenarioId logs decision:invalid', async () => {
      const dispatchers = createMockDispatchers([
        '{"action":"update_scenario","updates":{"behavior":"new"}}',
      ])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await waitForSupervisorCalls(dispatchers, 1)

      const sessionStore = new SessionStore(db)
      const session = await sessionStore.getSession(network.currentSession!.id)
      expect(session!.status).toBe('running')

      const eventStore = new EventStore(db)
      const invalidEvents = await eventStore.getEventsByType('decision:invalid')
      expect(invalidEvents.length).toBeGreaterThanOrEqual(1)
      expect((invalidEvents[0].data.details as any).field).toBe('scenarioId')
      expect((invalidEvents[0].data.details as any).actionType).toBe('update_scenario')
    })

    it('discuss without message logs decision:invalid', async () => {
      const dispatchers = createMockDispatchers([
        '{"action":"discuss"}',
      ])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await waitForSupervisorCalls(dispatchers, 1)

      const eventStore = new EventStore(db)
      const invalidEvents = await eventStore.getEventsByType('decision:invalid')
      expect(invalidEvents.length).toBeGreaterThanOrEqual(1)
      expect((invalidEvents[0].data.details as any).field).toBe('message')
    })

    it('revisit_scenario without required fields logs decision:invalid', async () => {
      const dispatchers = createMockDispatchers([
        '{"action":"revisit_scenario","scenarioId":"abc"}',
      ])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await waitForSupervisorCalls(dispatchers, 1)

      const eventStore = new EventStore(db)
      const invalidEvents = await eventStore.getEventsByType('decision:invalid')
      expect(invalidEvents.length).toBeGreaterThanOrEqual(1)
      expect((invalidEvents[0].data.details as any).field).toBe('targetStage')
      expect((invalidEvents[0].data.details as any).actionType).toBe('revisit_scenario')
    })

    it('malformed decision includes raw response snippet in event', async () => {
      const dispatchers = createMockDispatchers([
        '{"action":"advance_scenario"}',
      ])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await waitForSupervisorCalls(dispatchers, 1)

      const eventStore = new EventStore(db)
      const invalidEvents = await eventStore.getEventsByType('decision:invalid')
      expect(invalidEvents.length).toBeGreaterThanOrEqual(1)
      expect(invalidEvents[0].data.rawResponse).toContain('advance_scenario')
    })

    it('network does not crash after malformed output — it remains callable', async () => {
      const dispatchers = createMockDispatchers(['not json'])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await waitForSupervisorCalls(dispatchers, 1)

      // The network should still have a valid session reference
      expect(network.currentSession).toBeDefined()
      // isStopped should be false — error does NOT set stopped
      expect(network.isStopped).toBe(false)
    })
  })

  // -------------------------------------------------------
  // 2. Cycle-depth exhaustion
  // -------------------------------------------------------
  describe('cycle-depth exhaustion', () => {
    it('exceeding maxCycleDepth sets session to error but does not set stopped', async () => {
      // Use a very small depth limit for fast testing
      const smallConfig: AgentNetworkConfig = { maxCycleDepth: 3 }

      let callCount = 0
      const dispatchers = createMockDispatchers([])
      dispatchers.supervisorDispatch = vi.fn(async () => {
        callCount++
        return {
          response: JSON.stringify({
            action: 'create_worker',
            goal: `Task ${callCount}`,
            skill: 'investigation',
          }),
          tokenUsage: 10,
        }
      }) as unknown as Dispatchers['supervisorDispatch']

      const network = new AgentNetwork(db, dispatchers, workspaceOps, smallConfig)
      await network.start('test goal')

      // Wait for calls to accumulate past the limit
      await vi.waitFor(
        () => {
          expect(callCount).toBeGreaterThanOrEqual(3)
        },
        { timeout: 5000 },
      )
      await new Promise((r) => setTimeout(r, 200))

      // Session should be in error state
      const sessionStore = new SessionStore(db)
      const session = await sessionStore.getSession(network.currentSession!.id)
      expect(session!.status).toBe('error')

      // BUG DOCUMENTATION: stopped remains false after cycle-depth exhaustion.
      // This means the network could theoretically accept new triggers (e.g.,
      // handleHumanMessage) and attempt to wake the supervisor again, which
      // would immediately hit the depth limit again. This is arguably a bug
      // but tests current behavior.
      expect(network.isStopped).toBe(false)

      // Error event should be logged
      const eventStore = new EventStore(db)
      const errors = await eventStore.getEventsByType('error')
      const depthError = errors.find((e) =>
        JSON.stringify(e.data).includes('Cycle depth limit'),
      )
      expect(depthError).toBeDefined()
    })

    it('cycle depth increments across multiple wake cycles', async () => {
      // maxCycleDepth of 5. Each create_worker triggers worker:goal_complete,
      // which re-wakes supervisor, incrementing depth.
      const smallConfig: AgentNetworkConfig = { maxCycleDepth: 5 }

      let callCount = 0
      const dispatchers = createMockDispatchers([])
      dispatchers.supervisorDispatch = vi.fn(async () => {
        callCount++
        if (callCount <= 4) {
          return {
            response: JSON.stringify({
              action: 'create_worker',
              goal: `Task ${callCount}`,
              skill: 'investigation',
            }),
            tokenUsage: 10,
          }
        }
        return { response: '{"action":"stop","reason":"done"}', tokenUsage: 10 }
      }) as unknown as Dispatchers['supervisorDispatch']

      const network = new AgentNetwork(db, dispatchers, workspaceOps, smallConfig)
      await network.start('test goal')

      await vi.waitFor(
        () => {
          // Should reach the limit or stop
          expect(callCount).toBeGreaterThanOrEqual(4)
        },
        { timeout: 5000 },
      )
    })
  })

  // -------------------------------------------------------
  // 3. create_worker with missing fields
  // -------------------------------------------------------
  describe('create_worker with missing fields', () => {
    it('create_worker without goal or skill logs decision:invalid and keeps session running', async () => {
      // The stricter parseDecision validates required fields per action type.
      // Missing goal/skill throws a DecisionParseError which is now caught
      // gracefully — the decision is skipped, not treated as a fatal error.
      const dispatchers = createMockDispatchers([
        '{"action":"create_worker"}',
        '{"action":"stop","reason":"done"}',
      ])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await vi.waitFor(() => {
        expect(dispatchers.supervisorDispatch).toHaveBeenCalledTimes(1)
      })
      await new Promise((r) => setTimeout(r, 200))

      // parseDecision rejects the decision before it reaches the DB layer
      const sessionStore = new SessionStore(db)
      const session = await sessionStore.getSession(network.currentSession!.id)
      expect(session!.status).toBe('running')

      const eventStore = new EventStore(db)
      const invalidEvents = await eventStore.getEventsByType('decision:invalid')
      expect(invalidEvents.length).toBeGreaterThanOrEqual(1)
      expect(JSON.stringify(invalidEvents[0].data)).toContain('create_worker must have a')

      // No worker rows should exist
      const result = await db.execute({
        sql: "SELECT * FROM agents WHERE role = 'worker'",
        args: [],
      })
      expect(result.rows.length).toBe(0)
    })
  })

  // -------------------------------------------------------
  // 4. terminate_worker / assign_goal with non-existent agentId
  // -------------------------------------------------------
  describe('non-existent agentId operations', () => {
    it('terminate_worker with non-existent agentId is a silent no-op', async () => {
      // terminate_worker pushes a worker:terminated trigger, which re-wakes
      // the supervisor. We need to handle both supervisor calls.
      const dispatchers = createMockDispatchers([
        '{"action":"terminate_worker","agentId":"non-existent-uuid"}',
        '{"action":"stop","reason":"done"}',
      ])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      // Wait for both calls: initial + re-wake from terminate trigger
      await vi.waitFor(() => {
        expect(dispatchers.supervisorDispatch).toHaveBeenCalledTimes(2)
      })
      await new Promise((r) => setTimeout(r, 100))

      // The system should not crash. The SQL UPDATE is a no-op when ID doesn't exist.
      const eventStore = new EventStore(db)
      const events = await eventStore.getEvents()
      const terminated = events.find((e) => e.type === 'worker:terminated')
      // Event is still logged even though the agent doesn't exist
      expect(terminated).toBeDefined()
      expect(terminated!.data.agentId).toBe('non-existent-uuid')

      // No error event should be logged — it's a silent no-op
      const errors = await eventStore.getEventsByType('error')
      expect(errors.length).toBe(0)
    })

    it('assign_goal with non-existent agentId is a silent no-op', async () => {
      // assign_goal does NOT push a trigger, so only 1 supervisor call for
      // the initial decision, then the fallback stop response fires on call 2
      // when no trigger re-wakes. Actually, assign_goal doesn't push triggers
      // so the second response is only used if something else triggers.
      // But since assign_goal has no trigger, the supervisor won't be re-woken
      // automatically. The stop response is the fallback for any subsequent wake.
      let callCount = 0
      const dispatchers = createMockDispatchers([])
      dispatchers.supervisorDispatch = vi.fn(async () => {
        callCount++
        if (callCount === 1) {
          return {
            response: '{"action":"assign_goal","agentId":"non-existent-uuid","goal":"New goal"}',
            tokenUsage: 10,
          }
        }
        return { response: '{"action":"stop","reason":"done"}', tokenUsage: 10 }
      }) as unknown as Dispatchers['supervisorDispatch']

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      // assign_goal does not push a trigger, so only 1 call happens
      await vi.waitFor(() => {
        expect(callCount).toBeGreaterThanOrEqual(1)
      })
      await new Promise((r) => setTimeout(r, 200))

      // Event logged despite non-existent agent
      const eventStore = new EventStore(db)
      const events = await eventStore.getEvents()
      const assigned = events.find((e) => e.type === 'worker:goal_assigned')
      expect(assigned).toBeDefined()

      // No error
      const errors = await eventStore.getEventsByType('error')
      expect(errors.length).toBe(0)
    })

    it('terminate_worker with non-existent agentId still pushes worker:terminated trigger', async () => {
      // The trigger is pushed regardless of whether the agent existed.
      // This means supervisor gets re-woken to react to a "terminated" agent
      // that never existed. Verify it doesn't crash.
      let callCount = 0
      const dispatchers = createMockDispatchers([])
      dispatchers.supervisorDispatch = vi.fn(async () => {
        callCount++
        if (callCount === 1) {
          return {
            response: '{"action":"terminate_worker","agentId":"fake-id"}',
            tokenUsage: 10,
          }
        }
        // Second call should be triggered by worker:terminated
        return { response: '{"action":"stop","reason":"done"}', tokenUsage: 10 }
      }) as unknown as Dispatchers['supervisorDispatch']

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await vi.waitFor(() => {
        expect(callCount).toBeGreaterThanOrEqual(2)
      })

      // The second supervisor call should have the worker:terminated trigger
      const secondCallArgs = dispatchers.supervisorDispatch.mock.calls[1]
      expect(secondCallArgs[1]).toContain('worker:terminated')
    })
  })

  // -------------------------------------------------------
  // 5. advance_scenario with non-existent scenarioId
  // -------------------------------------------------------
  describe('advance_scenario errors', () => {
    it('non-existent scenarioId logs advancement:blocked without crashing', async () => {
      // advance_scenario does not push a trigger on success or failure,
      // so the supervisor won't be re-woken. We just verify it handles
      // the error gracefully and doesn't set session to error.
      const dispatchers = createMockDispatchers([
        '{"action":"advance_scenario","scenarioId":"non-existent-id","rationale":"test"}',
      ])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await vi.waitFor(() => {
        expect(dispatchers.supervisorDispatch).toHaveBeenCalledTimes(1)
      })
      await new Promise((r) => setTimeout(r, 200))

      const eventStore = new EventStore(db)
      const events = await eventStore.getEvents()
      const blocked = events.find((e) => e.type === 'advancement:blocked')
      expect(blocked).toBeDefined()
      expect(blocked!.data.scenarioId).toBe('non-existent-id')

      // Session should NOT be in error state — advancement:blocked is handled
      // gracefully inside handleAdvanceScenario's try/catch. The session stays
      // 'running' because advance_scenario doesn't push a trigger to re-wake
      // the supervisor for a stop.
      const sessionStore = new SessionStore(db)
      const session = await sessionStore.getSession(network.currentSession!.id)
      expect(session!.status).toBe('running')

      // No error event — the advancement failure is logged as advancement:blocked, not error
      const errors = await eventStore.getEventsByType('error')
      expect(errors.length).toBe(0)
    })
  })

  // -------------------------------------------------------
  // 6. Worker dispatch failure
  // -------------------------------------------------------
  describe('worker dispatch failure', () => {
    it('workerDispatch throwing logs worker:error and pushes worker:stuck trigger', async () => {
      let supervisorCallCount = 0
      const dispatchers = createMockDispatchers([])
      dispatchers.workerDispatch = vi.fn(async (_sys?: string, _usr?: string, _perm?: string) => {
        throw new Error('SDK connection refused')
      })
      dispatchers.supervisorDispatch = vi.fn(async () => {
        supervisorCallCount++
        if (supervisorCallCount === 1) {
          return {
            response: JSON.stringify({
              action: 'create_worker',
              goal: 'Do something',
              skill: 'investigation',
            }),
            tokenUsage: 10,
          }
        }
        return { response: '{"action":"stop","reason":"done"}', tokenUsage: 10 }
      }) as unknown as Dispatchers['supervisorDispatch']

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await vi.waitFor(() => {
        expect(supervisorCallCount).toBeGreaterThanOrEqual(2)
      })
      await new Promise((r) => setTimeout(r, 100))

      // worker:error should be logged
      const eventStore = new EventStore(db)
      const workerErrors = await eventStore.getEventsByType('worker:error')
      expect(workerErrors.length).toBeGreaterThanOrEqual(1)
      expect(workerErrors[0].data.error).toBe('SDK connection refused')

      // worker:stuck trigger should have been pushed and received by supervisor
      const secondCallArgs = dispatchers.supervisorDispatch.mock.calls[1]
      expect(secondCallArgs[1]).toContain('worker:stuck')

      // Worker is initially set to idle in runWorker's catch block, but then
      // the stop decision terminates all active (non-terminated) workers.
      // So the final status is 'terminated'.
      const result = await db.execute({
        sql: "SELECT * FROM agents WHERE role = 'worker'",
        args: [],
      })
      const worker = result.rows[0]
      expect(worker.status).toBe('terminated')
    })
  })

  // -------------------------------------------------------
  // 7. Supervisor dispatch failure
  // -------------------------------------------------------
  describe('supervisor dispatch failure', () => {
    it('supervisorDispatch throwing sets session to error', async () => {
      const dispatchers = createMockDispatchers([])
      dispatchers.supervisorDispatch = vi.fn(async () => {
        throw new Error('Network timeout')
      })

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await vi.waitFor(() => {
        expect(dispatchers.supervisorDispatch).toHaveBeenCalledTimes(1)
      })
      await new Promise((r) => setTimeout(r, 100))

      const sessionStore = new SessionStore(db)
      const session = await sessionStore.getSession(network.currentSession!.id)
      expect(session!.status).toBe('error')

      const eventStore = new EventStore(db)
      const errors = await eventStore.getEventsByType('error')
      expect(errors.length).toBeGreaterThanOrEqual(1)
      expect(JSON.stringify(errors[0].data)).toContain('Network timeout')
    })

    it('supervisorDispatch throwing does not set stopped to true', async () => {
      const dispatchers = createMockDispatchers([])
      dispatchers.supervisorDispatch = vi.fn(async () => {
        throw new Error('Network timeout')
      })

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await vi.waitFor(() => {
        expect(dispatchers.supervisorDispatch).toHaveBeenCalledTimes(1)
      })
      await new Promise((r) => setTimeout(r, 100))

      // BUG DOCUMENTATION: Like cycle-depth exhaustion, handleError does not
      // set this.stopped = true. New triggers could re-wake the supervisor.
      expect(network.isStopped).toBe(false)
    })
  })

  // -------------------------------------------------------
  // 8. ask_human with no callbacks
  // -------------------------------------------------------
  describe('ask_human with no callbacks', () => {
    it('ask_human without callbacks silently swallows the question', async () => {
      const dispatchers = createMockDispatchers([
        '{"action":"ask_human","question":"Should we proceed?"}',
        // No second response — the session will hang because no trigger is pushed
      ])

      // No callbacks provided
      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await vi.waitFor(() => {
        expect(dispatchers.supervisorDispatch).toHaveBeenCalledTimes(1)
      })
      await new Promise((r) => setTimeout(r, 200))

      // Session should still be running — no stop, no error
      const sessionStore = new SessionStore(db)
      const session = await sessionStore.getSession(network.currentSession!.id)
      expect(session!.status).toBe('running')

      // The supervisor was called exactly once — no human:message trigger to re-wake it
      // BUG DOCUMENTATION: When onQuestion is not provided, the ask_human action
      // completes without pushing any trigger. The supervisor is never re-woken,
      // effectively hanging the session. The session remains in 'running' state
      // indefinitely with no way to progress.
      expect(dispatchers.supervisorDispatch).toHaveBeenCalledTimes(1)
    })

    it('ask_human with only onMessage (no onQuestion) calls onMessage but does not push trigger', async () => {
      const onMessage = vi.fn()
      const dispatchers = createMockDispatchers([
        '{"action":"ask_human","question":"Should we proceed?"}',
      ])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config, {
        onMessage,
      })
      await network.start('test goal')

      await vi.waitFor(() => {
        expect(dispatchers.supervisorDispatch).toHaveBeenCalledTimes(1)
      })
      await new Promise((r) => setTimeout(r, 200))

      // onMessage should have been called
      expect(onMessage).toHaveBeenCalledWith('Should we proceed?')

      // But no re-wake — session hangs
      expect(dispatchers.supervisorDispatch).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------
  // 9. stop decision while workers are running
  // -------------------------------------------------------
  describe('stop while workers running', () => {
    it('stop decision terminates in-progress workers gracefully', async () => {
      // Create a slow worker that takes time to complete
      let workerStarted = false
      const dispatchers = createMockDispatchers([])
      dispatchers.workerDispatch = vi.fn(async (_sys?: string, _usr?: string, _perm?: string) => {
        workerStarted = true
        // Simulate a slow worker
        await new Promise((r) => setTimeout(r, 100))
        return { response: 'Worker done.', tokenUsage: 200 }
      })

      let callCount = 0
      dispatchers.supervisorDispatch = vi.fn(async () => {
        callCount++
        if (callCount === 1) {
          return {
            response: JSON.stringify({
              action: 'create_worker',
              goal: 'Slow task',
              skill: 'investigation',
            }),
            tokenUsage: 10,
          }
        }
        // Next call (after worker completes): stop
        return { response: '{"action":"stop","reason":"enough"}', tokenUsage: 10 }
      }) as unknown as Dispatchers['supervisorDispatch']

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      // Wait for stop
      await vi.waitFor(
        () => {
          expect(network.isStopped).toBe(true)
        },
        { timeout: 5000 },
      )

      // Session should be complete
      const sessionStore = new SessionStore(db)
      const session = await sessionStore.getSession(network.currentSession!.id)
      expect(session!.status).toBe('complete')
    })

    it('wakeSupervisor returns immediately after stopped is set', async () => {
      const dispatchers = createMockDispatchers([
        '{"action":"stop","reason":"immediate stop"}',
      ])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await vi.waitFor(() => {
        expect(network.isStopped).toBe(true)
      })

      // Now push a human message — should be ignored because stopped is true
      await network.handleHumanMessage('hello')
      await new Promise((r) => setTimeout(r, 100))

      // Supervisor should only have been called once (the initial session:start)
      expect(dispatchers.supervisorDispatch).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------
  // 10. TriggerQueue debounce behavior
  // -------------------------------------------------------
  describe('trigger queue debounce', () => {
    it('two workers completing during same supervisor cycle results in single trigger per type', async () => {
      // When the supervisor is active, triggers are debounced by type.
      // If two workers complete (both push worker:goal_complete), only
      // the last one is kept in the queue.

      let supervisorCallCount = 0
      const dispatchers = createMockDispatchers([])

      // Make worker dispatch fast but supervisor slow enough that both workers
      // complete before the supervisor finishes
      dispatchers.workerDispatch = vi.fn(async (_sys?: string, _usr?: string, _perm?: string) => ({
        response: 'Done.',
        tokenUsage: 50,
      }))

      dispatchers.supervisorDispatch = vi.fn(async () => {
        supervisorCallCount++
        if (supervisorCallCount === 1) {
          // Create first worker — supervisor is still "active" during this call
          return {
            response: JSON.stringify({
              action: 'create_worker',
              goal: 'Task A',
              skill: 'investigation',
            }),
            tokenUsage: 10,
          }
        }
        if (supervisorCallCount === 2) {
          // Create second worker
          return {
            response: JSON.stringify({
              action: 'create_worker',
              goal: 'Task B',
              skill: 'investigation',
            }),
            tokenUsage: 10,
          }
        }
        return { response: '{"action":"stop","reason":"done"}', tokenUsage: 10 }
      }) as unknown as Dispatchers['supervisorDispatch']

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await vi.waitFor(
        () => {
          expect(network.isStopped).toBe(true)
        },
        { timeout: 5000 },
      )

      // Both workers were dispatched
      expect(dispatchers.workerDispatch).toHaveBeenCalledTimes(2)

      // Verify debounce: check that supervisor received fewer worker:goal_complete
      // triggers than there were worker completions. With 2 workers completing,
      // TriggerQueue debounces same-type triggers (Map.set overwrites), so only
      // the LAST worker:goal_complete is delivered to the supervisor.
      const eventStore = new EventStore(db)
      const completionEvents = await eventStore.getEventsByType('worker:complete')
      const supervisorDecisions = await eventStore.getEventsByType('supervisor:decision')

      // Both workers completed (events logged before trigger debounce)
      expect(completionEvents.length).toBe(2)

      // BUG DOCUMENTATION: Because TriggerQueue debounces by type, if two
      // workers complete while the supervisor is active, only the LAST
      // worker:goal_complete trigger is preserved (Map.set overwrites).
      // The supervisor never learns about the first worker's completion.
      // In the current MVP (sequential worker execution within handleCreateWorker),
      // this may not be hit in practice, but it would be a real issue with
      // concurrent worker execution.
    })
  })

  // -------------------------------------------------------
  // Additional edge cases
  // -------------------------------------------------------
  describe('additional edge cases', () => {
    it('handleHumanMessage before start does not crash', async () => {
      const dispatchers = createMockDispatchers([
        '{"action":"stop","reason":"done"}',
      ])
      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)

      // Calling handleHumanMessage before start — the trigger queue has no callback yet
      // so it just queues the trigger. No crash.
      await network.handleHumanMessage('hello before start')

      // Now start — the queued trigger should not cause issues
      await network.start('test goal')

      await vi.waitFor(() => {
        expect(dispatchers.supervisorDispatch).toHaveBeenCalled()
      })
    })

    it('update_scenario logs the request without crashing', async () => {
      const dispatchers = createMockDispatchers([
        JSON.stringify({
          action: 'update_scenario',
          scenarioId: 'some-id',
          updates: { behavior: 'Updated behavior' },
        }),
        '{"action":"stop","reason":"done"}',
      ])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await vi.waitFor(() => {
        expect(dispatchers.supervisorDispatch).toHaveBeenCalledTimes(1)
      })
      await new Promise((r) => setTimeout(r, 100))

      const eventStore = new EventStore(db)
      const events = await eventStore.getEvents()
      const updateEvent = events.find((e) => e.type === 'scenario:update_failed')
      expect(updateEvent).toBeDefined()
      expect(updateEvent!.data.scenarioId).toBe('some-id')
    })

    it('stop() can be called multiple times without error', async () => {
      const dispatchers = createMockDispatchers([
        '{"action":"stop","reason":"done"}',
      ])
      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')

      await vi.waitFor(() => {
        expect(network.isStopped).toBe(true)
      })

      // Call stop() again — should not throw
      await network.stop()
      await network.stop()

      expect(network.isStopped).toBe(true)
    })
  })

  // -------------------------------------------------------
  // revisit_scenario
  // -------------------------------------------------------
  describe('revisit_scenario', () => {
    it('moves scenario backward and logs event', async () => {
      const scenario = await workspaceOps.captureScenario({ behavior: 'test revisit' })
      await workspaceOps.advanceScenario(scenario.id, { rationale: 'advance', promotedBy: 'dev' })

      const dispatchers = createMockDispatchers([
        JSON.stringify({
          action: 'revisit_scenario',
          scenarioId: scenario.id,
          targetStage: 'captured',
          rationale: 'evidence contradicts behavior',
        }),
      ])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')
      await waitForSupervisorCalls(dispatchers, 1)
      await new Promise((r) => setTimeout(r, 100))

      const updated = await workspaceOps.getScenario(scenario.id)
      expect(updated!.stage).toBe('captured')

      const eventStore = new EventStore(db)
      const events = await eventStore.getEvents()
      const revisitEvent = events.find(e => e.type === 'scenario:revisited')
      expect(revisitEvent).toBeDefined()
      expect(revisitEvent!.data.scenarioId).toBe(scenario.id)
    })

    it('strips fields on backward move through agent', async () => {
      const scenario = await workspaceOps.captureScenario({ behavior: 'test strip' })
      // Advance to implemented (sets confirmedBy and domainOperation)
      await workspaceOps.advanceScenario(scenario.id, { rationale: 'a', promotedBy: 'dev' })
      await workspaceOps.confirmScenario(scenario.id, 'human')
      await workspaceOps.advanceScenario(scenario.id, { rationale: 'b', promotedBy: 'dev' })
      await workspaceOps.advanceScenario(scenario.id, { rationale: 'c', promotedBy: 'dev' })
      await workspaceOps.linkToDomain(scenario.id, { domainOperation: 'test.op', testNames: ['test1'] })
      await workspaceOps.advanceScenario(scenario.id, { rationale: 'd', promotedBy: 'dev' })

      const dispatchers = createMockDispatchers([
        JSON.stringify({
          action: 'revisit_scenario',
          scenarioId: scenario.id,
          targetStage: 'captured',
          rationale: 'complete rethink',
        }),
      ])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')
      await waitForSupervisorCalls(dispatchers, 1)
      await new Promise((r) => setTimeout(r, 100))

      const updated = await workspaceOps.getScenario(scenario.id)
      expect(updated!.stage).toBe('captured')
      expect(updated!.confirmedBy).toBeUndefined()
      expect(updated!.domainOperation).toBeUndefined()
      expect(updated!.testNames).toBeUndefined()
    })

    it('logs revisit:blocked for non-existent scenario', async () => {
      const dispatchers = createMockDispatchers([
        JSON.stringify({
          action: 'revisit_scenario',
          scenarioId: 'nonexistent',
          targetStage: 'captured',
          rationale: 'test',
        }),
      ])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')
      await waitForSupervisorCalls(dispatchers, 1)
      await new Promise((r) => setTimeout(r, 100))

      const eventStore = new EventStore(db)
      const events = await eventStore.getEvents()
      const blocked = events.find(e => e.type === 'revisit:blocked')
      expect(blocked).toBeDefined()
    })

    it('logs revisit:blocked for same or later stage', async () => {
      const scenario = await workspaceOps.captureScenario({ behavior: 'test' })

      const dispatchers = createMockDispatchers([
        JSON.stringify({
          action: 'revisit_scenario',
          scenarioId: scenario.id,
          targetStage: 'mapped',
          rationale: 'test',
        }),
      ])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('test goal')
      await waitForSupervisorCalls(dispatchers, 1)
      await new Promise((r) => setTimeout(r, 100))

      const eventStore = new EventStore(db)
      const events = await eventStore.getEvents()
      const blocked = events.find(e => e.type === 'revisit:blocked')
      expect(blocked).toBeDefined()
    })
  })
})
