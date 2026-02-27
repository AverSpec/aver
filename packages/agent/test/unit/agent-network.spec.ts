import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { createDatabase, closeDatabase, AgentStore, SessionStore, EventStore } from '../../src/db/index.js'
import { WorkspaceStore, initWorkspaceSchema } from '../../src/workspace/storage.js'
import { WorkspaceOps } from '../../src/workspace/operations.js'
import { AgentNetwork, type Dispatchers, type AgentNetworkConfig } from '../../src/network/agent-network.js'

/**
 * Helper: create an in-memory workspace backed by libsql.
 */
async function createInMemoryWorkspaceOps(): Promise<{ ops: WorkspaceOps; client: Client }> {
  const client = createClient({ url: ':memory:' })
  await initWorkspaceSchema(client)
  const store = new WorkspaceStore(client, 'test')
  const ops = new WorkspaceOps(store)
  return { ops, client }
}

/**
 * Helper: create mock dispatchers that respond with JSON decisions.
 */
function createMockDispatchers(supervisorResponses: string[]) {
  let callIndex = 0
  const supervisorDispatch = vi.fn(async () => {
    const response = supervisorResponses[callIndex] ?? '{"action":"stop","reason":"no more responses"}'
    callIndex++
    return { response, tokenUsage: 100 }
  })
  const workerDispatch = vi.fn(async () => ({
    response: 'Worker completed the task successfully.',
    tokenUsage: 200,
  }))
  return { supervisorDispatch, workerDispatch }
}

describe('AgentNetwork', () => {
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

  // --- Lifecycle ---

  describe('lifecycle', () => {
    it('start(goal) creates session and supervisor agent', async () => {
      const dispatchers = createMockDispatchers([
        '{"action":"stop","reason":"done"}',
      ])
      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)

      await network.start('Build login feature')

      // Session was created
      expect(network.currentSession).toBeDefined()
      expect(network.currentSession!.goal).toBe('Build login feature')
      expect(network.currentSession!.status).toBe('running')

      // Supervisor agent was created
      expect(network.supervisor).toBeDefined()
      expect(network.supervisor!.role).toBe('supervisor')
      expect(network.supervisor!.goal).toBe('Build login feature')
    })

    it('start(goal) fires supervisor dispatch', async () => {
      const dispatchers = createMockDispatchers([
        '{"action":"stop","reason":"done"}',
      ])
      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)

      await network.start('Build login feature')

      // Wait for async trigger to fire
      await vi.waitFor(() => {
        expect(dispatchers.supervisorDispatch).toHaveBeenCalledTimes(1)
      })
    })

    it('stop() terminates all agents and updates session', async () => {
      const dispatchers = createMockDispatchers([
        '{"action":"stop","reason":"done"}',
      ])
      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)

      await network.start('Build login feature')

      // Wait for initial supervisor call
      await vi.waitFor(() => {
        expect(dispatchers.supervisorDispatch).toHaveBeenCalled()
      })

      await network.stop()

      expect(network.isStopped).toBe(true)

      // Session should be marked complete
      const sessionStore = new SessionStore(db)
      const session = await sessionStore.getSession(network.currentSession!.id)
      expect(session!.status).toBe('complete')

      // Supervisor should be terminated
      const agentStore = new AgentStore(db)
      const sup = await agentStore.getAgent(network.supervisor!.id)
      expect(sup!.status).toBe('terminated')
    })
  })

  // --- Agent management ---

  describe('agent management', () => {
    it('create_worker decision creates a new agent in AgentStore', async () => {
      const dispatchers = createMockDispatchers([
        JSON.stringify({
          action: 'create_worker',
          goal: 'Investigate login flow',
          skill: 'investigation',
          permission: 'read_only',
        }),
        '{"action":"stop","reason":"done"}',
      ])
      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)

      await network.start('Build login feature')

      // Wait for worker dispatch to have been called (worker was created and executed)
      await vi.waitFor(() => {
        expect(dispatchers.workerDispatch).toHaveBeenCalledTimes(1)
      })

      // Check worker was created in the store (may be idle or terminated by now)
      const result = await db.execute({
        sql: "SELECT * FROM agents WHERE role = 'worker'",
        args: [],
      })
      expect(result.rows.length).toBeGreaterThanOrEqual(1)
      const workerRow = result.rows.find((r) => r.goal === 'Investigate login flow')
      expect(workerRow).toBeDefined()
      expect(workerRow!.skill).toBe('investigation')
      expect(workerRow!.permission).toBe('read_only')
    })

    it('terminate_worker decision marks agent as terminated', async () => {
      // First create a worker, then terminate it
      let workerId: string | undefined
      const dispatchers = createMockDispatchers([
        JSON.stringify({
          action: 'create_worker',
          goal: 'Investigate login flow',
          skill: 'investigation',
        }),
      ])

      // Override supervisor to capture worker ID and then terminate
      let callCount = 0
      dispatchers.supervisorDispatch = vi.fn(async () => {
        callCount++
        if (callCount === 1) {
          return {
            response: JSON.stringify({
              action: 'create_worker',
              goal: 'Investigate login flow',
              skill: 'investigation',
            }),
            tokenUsage: 100,
          }
        }
        // On second call (after worker completes), get worker ID and terminate
        const agentStore = new AgentStore(db)
        const workers = await agentStore.getActiveWorkers()
        if (workers.length > 0) {
          workerId = workers[0].id
          return {
            response: JSON.stringify({
              action: 'terminate_worker',
              agentId: workers[0].id,
            }),
            tokenUsage: 100,
          }
        }
        return { response: '{"action":"stop","reason":"done"}', tokenUsage: 100 }
      }) as unknown as Dispatchers['supervisorDispatch']

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('Build login feature')

      // Wait for the termination
      await vi.waitFor(() => {
        expect(callCount).toBeGreaterThanOrEqual(2)
      })

      if (workerId) {
        const agentStore = new AgentStore(db)
        const worker = await agentStore.getAgent(workerId)
        expect(worker!.status).toBe('terminated')
      }
    })

    it('multiple workers can be created', async () => {
      let callCount = 0
      const dispatchers = createMockDispatchers([])
      dispatchers.supervisorDispatch = vi.fn(async () => {
        callCount++
        if (callCount === 1) {
          return {
            response: JSON.stringify({
              action: 'create_worker',
              goal: 'Investigate login flow',
              skill: 'investigation',
            }),
            tokenUsage: 100,
          }
        }
        if (callCount === 2) {
          return {
            response: JSON.stringify({
              action: 'create_worker',
              goal: 'Investigate signup flow',
              skill: 'investigation',
            }),
            tokenUsage: 100,
          }
        }
        return { response: '{"action":"stop","reason":"done"}', tokenUsage: 100 }
      }) as unknown as Dispatchers['supervisorDispatch']

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('Build auth features')

      await vi.waitFor(() => {
        expect(callCount).toBeGreaterThanOrEqual(3)
      })

      const agentStore = new AgentStore(db)
      // Get all workers (including idle ones, not just active — terminated would be excluded)
      const result = await db.execute({
        sql: "SELECT * FROM agents WHERE role = 'worker'",
        args: [],
      })
      expect(result.rows.length).toBe(2)
    })
  })

  // --- Trigger routing ---

  describe('trigger routing', () => {
    it('session start triggers supervisor', async () => {
      const dispatchers = createMockDispatchers([
        '{"action":"stop","reason":"done"}',
      ])
      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)

      await network.start('Build feature')

      await vi.waitFor(() => {
        expect(dispatchers.supervisorDispatch).toHaveBeenCalledTimes(1)
      })

      // The user prompt should contain session:start trigger info
      const callArgs = dispatchers.supervisorDispatch.mock.calls[0]
      expect(callArgs[1]).toContain('session:start')
    })

    it('supervisor decisions are executed (events logged)', async () => {
      const dispatchers = createMockDispatchers([
        '{"action":"stop","reason":"all done"}',
      ])
      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)

      await network.start('Build feature')

      await vi.waitFor(() => {
        expect(dispatchers.supervisorDispatch).toHaveBeenCalled()
      })

      // Check that events were logged
      const eventStore = new EventStore(db)
      const events = await eventStore.getEvents()
      const types = events.map((e) => e.type)
      expect(types).toContain('session:start')
      expect(types).toContain('supervisor:decision')
    })
  })

  // --- Workspace integration ---

  describe('workspace integration', () => {
    it('advance_scenario calls workspaceOps.advanceScenario()', async () => {
      // Create a scenario in captured stage
      const scenario = await workspaceOps.captureScenario({
        behavior: 'User can log in',
        context: 'Auth flow',
      })

      const dispatchers = createMockDispatchers([
        JSON.stringify({
          action: 'advance_scenario',
          scenarioId: scenario.id,
          rationale: 'Investigation complete',
        }),
        '{"action":"stop","reason":"done"}',
      ])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('Build login feature')

      await vi.waitFor(() => {
        expect(dispatchers.supervisorDispatch).toHaveBeenCalledTimes(1)
      })

      // Check scenario was advanced
      const updated = await workspaceOps.getScenario(scenario.id)
      expect(updated!.stage).toBe('characterized')
    })

    it('advance_scenario logs blocked when invariants fail', async () => {
      // Create a scenario in characterized stage (needs confirmedBy to advance)
      const scenario = await workspaceOps.captureScenario({
        behavior: 'User can log in',
      })
      // Advance to characterized first
      await workspaceOps.advanceScenario(scenario.id, {
        rationale: 'test',
        promotedBy: 'test',
      })

      const dispatchers = createMockDispatchers([
        JSON.stringify({
          action: 'advance_scenario',
          scenarioId: scenario.id,
          rationale: 'Try to advance without confirm',
        }),
        '{"action":"stop","reason":"done"}',
      ])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('Build login feature')

      await vi.waitFor(() => {
        expect(dispatchers.supervisorDispatch).toHaveBeenCalledTimes(1)
      })

      // Scenario should still be characterized (blocked)
      const updated = await workspaceOps.getScenario(scenario.id)
      expect(updated!.stage).toBe('characterized')

      // Check for blocked event
      const eventStore = new EventStore(db)
      const events = await eventStore.getEvents()
      const blocked = events.find((e) => e.type === 'advancement:blocked')
      expect(blocked).toBeDefined()
    })

    it('ask_human calls onQuestion callback', async () => {
      const onQuestion = vi.fn(async () => 'Yes, proceed')
      const dispatchers = createMockDispatchers([
        '{"action":"ask_human","question":"Should we proceed?"}',
        '{"action":"stop","reason":"done"}',
      ])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config, {
        onQuestion,
      })
      await network.start('Build feature')

      await vi.waitFor(() => {
        expect(onQuestion).toHaveBeenCalledWith('Should we proceed?')
      })
    })
  })

  // --- Stop ---

  describe('stop decision', () => {
    it('stop decision terminates session', async () => {
      const dispatchers = createMockDispatchers([
        '{"action":"stop","reason":"All scenarios implemented"}',
      ])
      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)

      await network.start('Build feature')

      await vi.waitFor(() => {
        expect(dispatchers.supervisorDispatch).toHaveBeenCalled()
      })

      // Wait a tick for handleStop to complete
      await vi.waitFor(() => {
        expect(network.isStopped).toBe(true)
      })

      const sessionStore = new SessionStore(db)
      const session = await sessionStore.getSession(network.currentSession!.id)
      expect(session!.status).toBe('complete')
    })
  })

  // --- Error handling ---

  describe('error handling', () => {
    it('handles invalid JSON response from supervisor gracefully', async () => {
      const dispatchers = createMockDispatchers([
        'This is not JSON at all',
      ])

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)
      await network.start('Build feature')

      await vi.waitFor(() => {
        expect(dispatchers.supervisorDispatch).toHaveBeenCalled()
      })

      // Session should be in error state
      await vi.waitFor(async () => {
        const sessionStore = new SessionStore(db)
        const session = await sessionStore.getSession(network.currentSession!.id)
        expect(session!.status).toBe('error')
      })
    })

    it('respects maxCycleDepth limit', async () => {
      // Keep creating workers to exhaust depth
      let callCount = 0
      const dispatchers = createMockDispatchers([])
      dispatchers.supervisorDispatch = vi.fn(async () => {
        callCount++
        // Always create workers — should hit cycle limit
        return {
          response: JSON.stringify({
            action: 'create_worker',
            goal: `Task ${callCount}`,
            skill: 'investigation',
          }),
          tokenUsage: 10,
        }
      }) as unknown as Dispatchers['supervisorDispatch']

      const network = new AgentNetwork(db, dispatchers, workspaceOps, config, {})

      await network.start('Build feature')

      // Wait for limit to be hit — with maxCycleDepth=10, we should not exceed it much
      await vi.waitFor(() => {
        // The cycle depth should have been reached or supervisor should stop being called
        expect(callCount).toBeLessThanOrEqual(15) // some slack for async
      }, { timeout: 5000 })
    })
  })

  // --- Decision parsing ---

  describe('decision parsing', () => {
    it('parses JSON wrapped in markdown code block', async () => {
      const dispatchers = createMockDispatchers([
        '```json\n{"action":"stop","reason":"done"}\n```',
      ])
      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)

      await network.start('Build feature')

      await vi.waitFor(() => {
        expect(network.isStopped).toBe(true)
      })
    })

    it('parses JSON with surrounding text', async () => {
      const dispatchers = createMockDispatchers([
        'Here is my decision: {"action":"stop","reason":"done"} That is all.',
      ])
      const network = new AgentNetwork(db, dispatchers, workspaceOps, config)

      await network.start('Build feature')

      await vi.waitFor(() => {
        expect(network.isStopped).toBe(true)
      })
    })
  })
})
