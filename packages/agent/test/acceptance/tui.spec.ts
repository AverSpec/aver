import { suite } from '@aver/core'
import { AverTui } from '../../src/tui-domain.js'
import { averTuiAdapter } from './tui-adapter.js'

const { test } = suite(AverTui, averTuiAdapter)

test('starts in awaiting_goal phase', async ({ then }) => {
  await then.phaseIs({ phase: 'awaiting_goal' })
  await then.hasNoPendingQuestion()
})

test('transitions phase from awaiting_goal to running to stopped', async ({ act, then }) => {
  await act.changePhase({ phase: 'running' })
  await then.phaseIs({ phase: 'running' })

  await act.changePhase({ phase: 'stopped' })
  await then.phaseIs({ phase: 'stopped' })
})

test('worker:dispatch event creates a running worker', async ({ act, then }) => {
  await act.dispatchEvent({
    event: {
      timestamp: '2026-01-01T00:00:00Z',
      type: 'worker:dispatch',
      cycleId: 'cycle-1',
      data: { goal: 'Investigate auth', skill: 'investigation', permissionLevel: 'read_only' },
    },
  })
  await then.hasWorkerWithGoal({ goal: 'Investigate auth' })
  await then.workerStatusIs({ goal: 'Investigate auth', status: 'running' })
})

test('worker:result event completes a running worker', async ({ act, query, then }) => {
  await act.dispatchEvent({
    event: {
      timestamp: '2026-01-01T00:00:00Z',
      type: 'worker:dispatch',
      cycleId: 'cycle-1',
      data: { goal: 'Map rules', skill: 'scenario-mapping' },
    },
  })
  await act.dispatchEvent({
    event: {
      timestamp: '2026-01-01T00:00:01Z',
      type: 'worker:result',
      cycleId: 'cycle-1',
      data: { summary: 'Found 3 rules', status: 'complete' },
    },
  })
  await then.workerStatusIs({ goal: 'Map rules', status: 'complete' })
  const running = await query.workersWithStatus({ status: 'running' })
  expect(running).toHaveLength(0)
})

test('worker:result with stuck status marks worker as stuck', async ({ act, then }) => {
  await act.dispatchEvent({
    event: {
      timestamp: '2026-01-01T00:00:00Z',
      type: 'worker:dispatch',
      cycleId: 'cycle-1',
      data: { goal: 'Trace boundaries', skill: 'investigation' },
    },
  })
  await act.dispatchEvent({
    event: {
      timestamp: '2026-01-01T00:00:01Z',
      type: 'worker:result',
      cycleId: 'cycle-1',
      data: { summary: 'Blocked on missing context', status: 'stuck' },
    },
  })
  await then.workerStatusIs({ goal: 'Trace boundaries', status: 'stuck' })
})

test('tracks multiple workers with mixed statuses', async ({ act, query }) => {
  // Dispatch 3 workers
  for (const goal of ['Worker A', 'Worker B', 'Worker C']) {
    await act.dispatchEvent({
      event: {
        timestamp: new Date().toISOString(),
        type: 'worker:dispatch',
        cycleId: 'cycle-1',
        data: { goal, skill: 'investigation' },
      },
    })
  }

  // Complete last two (LIFO: C first, then B)
  await act.dispatchEvent({
    event: {
      timestamp: new Date().toISOString(),
      type: 'worker:result',
      cycleId: 'cycle-1',
      data: { summary: 'C done', status: 'complete' },
    },
  })
  await act.dispatchEvent({
    event: {
      timestamp: new Date().toISOString(),
      type: 'worker:result',
      cycleId: 'cycle-1',
      data: { summary: 'B done', status: 'complete' },
    },
  })

  const total = await query.workerCount()
  expect(total).toBe(3)

  const running = await query.workersWithStatus({ status: 'running' })
  expect(running).toHaveLength(1)
  expect(running[0].goal).toBe('Worker A')

  const complete = await query.workersWithStatus({ status: 'complete' })
  expect(complete).toHaveLength(2)
})

test('syncs scenarios with progress counts', async ({ act, query, then }) => {
  await act.updateScenarios({
    scenarios: [
      { id: 'sc-1', stage: 'captured', behavior: 'user login' },
      { id: 'sc-2', stage: 'implemented', behavior: 'user logout' },
      { id: 'sc-3', stage: 'specified', behavior: 'password reset' },
    ],
  })

  await then.scenarioCountIs({ count: 3 })
  const implemented = await query.implementedCount()
  expect(implemented).toBe(1)
})

test('shows pending question when received', async ({ act, then }) => {
  await act.receiveQuestion({ id: 'q-1', question: 'Which module?', options: ['auth', 'payments'] })
  await then.questionTextIs({ text: 'Which module?' })
})

test('clears pending question when answered', async ({ act, then }) => {
  await act.receiveQuestion({ id: 'q-1', question: 'Split auth?' })
  await then.questionTextIs({ text: 'Split auth?' })

  await act.answerQuestion({ questionId: 'q-1' })
  await then.hasNoPendingQuestion()
})

test('promotes queued question after answering current', async ({ act, query, then }) => {
  await act.receiveQuestion({ id: 'q-1', question: 'First question?' })
  await act.receiveQuestion({ id: 'q-2', question: 'Second question?' })

  await then.questionTextIs({ text: 'First question?' })
  const queueLen = await query.questionQueueLength()
  expect(queueLen).toBe(1)

  await act.answerQuestion({ questionId: 'q-1' })
  await then.questionTextIs({ text: 'Second question?' })
  const afterLen = await query.questionQueueLength()
  expect(afterLen).toBe(0)
})
