import { suite } from '@aver/core'
import { AverTui } from './domains/aver-tui.js'
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

test('worker:created event creates a running worker', async ({ act, then }) => {
  await act.dispatchEvent({
    event: {
      id: 'evt-1',
      type: 'worker:created',
      data: { agentId: 'w-1', goal: 'Investigate auth', skill: 'investigation' },
      createdAt: '2026-01-01T00:00:00Z',
    },
  })
  await then.hasWorkerWithGoal({ goal: 'Investigate auth' })
  await then.workerStatusIs({ goal: 'Investigate auth', status: 'running' })
})

test('worker:complete event completes a running worker', async ({ act, query, then }) => {
  await act.dispatchEvent({
    event: {
      id: 'evt-1',
      type: 'worker:created',
      data: { agentId: 'w-1', goal: 'Map rules', skill: 'scenario-mapping' },
      createdAt: '2026-01-01T00:00:00Z',
    },
  })
  await act.dispatchEvent({
    event: {
      id: 'evt-2',
      type: 'worker:complete',
      data: { agentId: 'w-1', summary: 'Found 3 rules' },
      createdAt: '2026-01-01T00:00:01Z',
    },
  })
  await then.workerStatusIs({ goal: 'Map rules', status: 'complete' })
  const running = await query.workersWithStatus({ status: 'running' })
  expect(running).toHaveLength(0)
})

test('worker:error event marks worker as error', async ({ act, then }) => {
  await act.dispatchEvent({
    event: {
      id: 'evt-1',
      type: 'worker:created',
      data: { agentId: 'w-1', goal: 'Trace boundaries', skill: 'investigation' },
      createdAt: '2026-01-01T00:00:00Z',
    },
  })
  await act.dispatchEvent({
    event: {
      id: 'evt-2',
      type: 'worker:error',
      data: { agentId: 'w-1', error: 'Blocked on missing context' },
      createdAt: '2026-01-01T00:00:01Z',
    },
  })
  await then.workerStatusIs({ goal: 'Trace boundaries', status: 'error' })
})

test('tracks multiple workers with mixed statuses', async ({ act, query }) => {
  // Create 3 workers
  await act.dispatchEvent({
    event: {
      id: 'evt-1',
      type: 'worker:created',
      data: { agentId: 'w-a', goal: 'Worker A', skill: 'investigation' },
      createdAt: new Date().toISOString(),
    },
  })
  await act.dispatchEvent({
    event: {
      id: 'evt-2',
      type: 'worker:created',
      data: { agentId: 'w-b', goal: 'Worker B', skill: 'investigation' },
      createdAt: new Date().toISOString(),
    },
  })
  await act.dispatchEvent({
    event: {
      id: 'evt-3',
      type: 'worker:created',
      data: { agentId: 'w-c', goal: 'Worker C', skill: 'investigation' },
      createdAt: new Date().toISOString(),
    },
  })

  // Complete C and B
  await act.dispatchEvent({
    event: {
      id: 'evt-4',
      type: 'worker:complete',
      data: { agentId: 'w-c', summary: 'C done' },
      createdAt: new Date().toISOString(),
    },
  })
  await act.dispatchEvent({
    event: {
      id: 'evt-5',
      type: 'worker:complete',
      data: { agentId: 'w-b', summary: 'B done' },
      createdAt: new Date().toISOString(),
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
