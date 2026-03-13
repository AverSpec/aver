import { expect } from 'vitest'
import { suite } from '@aver/core'
import { approve } from '@aver/approvals'
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

test('track full task lifecycle', async ({ act, query }) => {
  await act.createTask({ title: 'Fix login bug' })
  await act.assignTask({ title: 'Fix login bug', assignee: 'Alice' })
  await act.moveTask({ title: 'Fix login bug', status: 'in-progress' })

  const task = await query.taskDetails({ title: 'Fix login bug' })
  expect(task?.status).toBe('in-progress')
  expect(task?.assignee).toBe('Alice')
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
