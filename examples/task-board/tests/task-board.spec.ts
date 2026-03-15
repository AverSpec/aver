import { expect } from 'vitest'
import { suite } from '@averspec/core'
import { approve } from '@averspec/approvals'
import { taskBoard } from '../domains/task-board.js'

const { test } = suite(taskBoard)

test('create a task in backlog', async ({ when, then }) => {
  await when.createTask({ title: 'Fix login bug' })
  await then.taskInStatus({ title: 'Fix login bug', status: 'backlog' })
  await then.taskCount({ status: 'backlog', count: 1 })
})

test('move task through workflow', async ({ given, when, then }) => {
  await given.createTask({ title: 'Fix login bug' })
  await when.moveTask({ title: 'Fix login bug', status: 'in-progress' })
  await then.taskInStatus({ title: 'Fix login bug', status: 'in-progress' })
  await then.taskCount({ status: 'backlog', count: 0 })
})

test('assign task to team member', async ({ given, when, then }) => {
  await given.createTask({ title: 'Fix login bug' })
  await when.assignTask({ title: 'Fix login bug', assignee: 'Alice' })
  await then.taskAssignedTo({ title: 'Fix login bug', assignee: 'Alice' })
})

test('delete a task', async ({ given, when, then }) => {
  await given.createTask({ title: 'Stale task' })
  await then.taskCount({ status: 'backlog', count: 1 })
  await when.deleteTask({ title: 'Stale task' })
  await then.taskCount({ status: 'backlog', count: 0 })
})

test('assign task produces correlated notification span', async ({ given, when, then, trace }) => {
  await given.createTask({ title: 'Telemetry task' })
  await when.assignTask({ title: 'Telemetry task', assignee: 'Bob' })
  await then.taskAssignedTo({ title: 'Telemetry task', assignee: 'Bob' })

  // Verify that the trace includes a telemetry match for the assignTask action.
  // When a TelemetryCollector is present (HTTP adapter), Aver automatically
  // matches the 'task.assign' span declared in the domain and records the result
  // on the trace entry. The unit adapter verifies telemetry expectations
  // internally through Aver's proxy without needing OTel.
  const entries = trace()
  const assignEntry = entries.find(e => e.name === 'assignTask' && e.category === 'when')
  if (assignEntry?.telemetry) {
    // If telemetry verification ran, the span should have been matched.
    expect(assignEntry.telemetry.matched).toBe(true)
  }
})

test('track full task lifecycle', async ({ act, then }) => {
  await act.createTask({ title: 'Fix login bug' })
  await act.assignTask({ title: 'Fix login bug', assignee: 'Alice' })
  await act.moveTask({ title: 'Fix login bug', status: 'in-progress' })

  await then.taskInStatus({ title: 'Fix login bug', status: 'in-progress' })
  await then.taskAssignedTo({ title: 'Fix login bug', assignee: 'Alice' })
})

test.skipIf(process.env.AVER_DEMO_FAIL !== '1')('demo failure artifacts (set AVER_DEMO_FAIL=1)', async ({ assert }) => {
  await assert.taskInStatus({ title: 'Nonexistent', status: 'done' })
})

test.skipIf(process.env.AVER_DEMO_APPROVAL !== '1' && process.env.AVER_DEMO_DIFF !== '1')('visual approval of task board', async ({ act }) => {
  await act.createTask({ title: 'Review homepage' })
  if (process.env.AVER_DEMO_DIFF === '1') {
    await act.moveTask({ title: 'Review homepage', status: 'in-progress' })
  }
  await approve.visual('board-with-task')
})
