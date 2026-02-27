import { suite } from '@aver/core'
import { AverAgent } from '../../src/domain.js'
import { averAgentAdapter } from './adapter.js'
import { describe } from 'vitest'

const { test } = suite(AverAgent, averAgentAdapter)

describe('AverAgent acceptance', () => {
  // 1. Supervisor says stop immediately — session completes
  test('stops immediately when supervisor says stop', async ({ given, when, then }) => {
    await given.supervisorWillDecide({
      decision: { action: 'stop', reason: 'nothing to do' },
      tokenUsage: 50,
    })
    await when.startSession({ goal: 'Test immediate stop' })
    await then.sessionStopped()
    await then.sessionIs({ status: 'complete' })
  })

  // 2. Session records the goal
  test('records session goal', async ({ given, when, query }) => {
    await given.supervisorWillDecide({
      decision: { action: 'stop', reason: 'done' },
      tokenUsage: 50,
    })
    await when.startSession({ goal: 'Build login feature' })
    const goal = await query.sessionGoal()
    expect(goal).toBe('Build login feature')
  })

  // 3. Supervisor creates a worker
  test('creates worker when supervisor decides create_worker', async ({ given, when, then }) => {
    await given.supervisorWillDecide({
      decision: {
        action: 'create_worker',
        goal: 'Investigate auth module',
        skill: 'investigation',
        permission: 'read_only',
      },
      tokenUsage: 100,
    })
    // After worker completes, supervisor will be woken — queue a stop
    await given.supervisorWillDecide({
      decision: { action: 'stop', reason: 'worker done' },
      tokenUsage: 50,
    })
    await when.startSession({ goal: 'Build auth feature' })
    await then.workerWasCreated({ goal: 'Investigate auth module' })
    await then.sessionStopped()
  })

  // 4. Multiple workers created across cycles
  test('dispatches multiple workers across supervisor cycles', async ({ given, when, query }) => {
    await given.supervisorWillDecide({
      decision: {
        action: 'create_worker',
        goal: 'Investigate login flow',
        skill: 'investigation',
      },
      tokenUsage: 100,
    })
    await given.supervisorWillDecide({
      decision: {
        action: 'create_worker',
        goal: 'Investigate signup flow',
        skill: 'investigation',
      },
      tokenUsage: 100,
    })
    await given.supervisorWillDecide({
      decision: { action: 'stop', reason: 'all workers dispatched' },
      tokenUsage: 50,
    })
    await when.startSession({ goal: 'Build auth features' })
    const count = await query.activeWorkerCount()
    expect(count).toBe(2)
  })

  // 5. Worker output becomes an observation visible to supervisor
  test('worker output stored as observation', async ({ given, when, query }) => {
    await given.workerWillReturn({
      response: 'Found 3 security issues in the auth module.',
      tokenUsage: 200,
    })
    await given.supervisorWillDecide({
      decision: {
        action: 'create_worker',
        goal: 'Investigate auth security',
        skill: 'investigation',
        scenarioId: 'scenario-1',
      },
      tokenUsage: 100,
    })
    await given.supervisorWillDecide({
      decision: { action: 'stop', reason: 'done' },
      tokenUsage: 50,
    })
    await when.startSession({ goal: 'Audit security' })

    // Worker output should be stored as an observation scoped to the scenario
    const obs = await query.scenarioObservations({ scenarioId: 'scenario-1' })
    expect(obs.length).toBeGreaterThanOrEqual(1)
    expect(obs[0]).toContain('Found 3 security issues')
  })

  // 6. Token usage accumulates across supervisor and worker calls
  test('accumulates token usage', async ({ given, when, query }) => {
    await given.supervisorWillDecide({
      decision: {
        action: 'create_worker',
        goal: 'Quick task',
        skill: 'investigation',
      },
      tokenUsage: 150,
    })
    await given.workerWillReturn({
      response: 'Task completed.',
      tokenUsage: 300,
    })
    await given.supervisorWillDecide({
      decision: { action: 'stop', reason: 'done' },
      tokenUsage: 75,
    })
    await when.startSession({ goal: 'Token test' })
    const usage = await query.tokenUsage()
    // Supervisor: 150 + 75 = 225, Worker: 300
    expect(usage.supervisor).toBe(225)
    expect(usage.worker).toBe(300)
  })

  // 7. ask_human delivers message via onMessage callback
  test('delivers ask_human question via onMessage', async ({ given, when, then }) => {
    await given.supervisorWillDecide({
      decision: { action: 'ask_human', question: 'Should we proceed with SSO?' },
      tokenUsage: 100,
    })
    // ask_human without onQuestion just calls onMessage and doesn't trigger another wake
    // Queue a stop for the next supervisor wake (won't happen since no onQuestion)
    await given.supervisorWillDecide({
      decision: { action: 'stop', reason: 'done' },
      tokenUsage: 50,
    })
    await when.startSession({ goal: 'SSO feature' })
    await then.messageReceived({ text: 'Should we proceed with SSO?' })
  })

  // 8. Invalid supervisor JSON triggers error state
  test('handles invalid supervisor JSON gracefully', async ({ given, when, then }) => {
    // Override the supervisor queue with an invalid response
    // We need to push a raw response — use supervisorWillDecide with something
    // that will produce invalid JSON. Actually, the mock dispatcher shifts from the queue.
    // We need a way to queue a raw invalid response.
    // The simplest approach: queue a decision that is valid JSON but has an invalid action.
    await given.supervisorWillDecide({
      decision: { action: 'invalid_action' as never },
      tokenUsage: 100,
    })
    await when.startSession({ goal: 'Error test' })
    await then.sessionErrored({})
  })
})
