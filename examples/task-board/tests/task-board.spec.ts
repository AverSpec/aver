import { expect } from 'vitest'
import { suite } from '@aver/core'
import { approve } from '@aver/approvals'
import { taskBoard } from '../domains/task-board.js'

const { test } = suite(taskBoard)

test('create a task in backlog', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix login bug' })
  await assert.taskInStatus({ title: 'Fix login bug', status: 'backlog' })
  await assert.taskCount({ status: 'backlog', count: 1 })
})

test('move task through workflow', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix login bug' })
  await act.moveTask({ title: 'Fix login bug', status: 'in-progress' })
  await assert.taskInStatus({ title: 'Fix login bug', status: 'in-progress' })
  await assert.taskCount({ status: 'backlog', count: 0 })
})

test('assign task to team member', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix login bug' })
  await act.assignTask({ title: 'Fix login bug', assignee: 'Alice' })
  await assert.taskAssignedTo({ title: 'Fix login bug', assignee: 'Alice' })
})

test('delete a task', async ({ act, assert }) => {
  await act.createTask({ title: 'Stale task' })
  await assert.taskCount({ status: 'backlog', count: 1 })
  await act.deleteTask({ title: 'Stale task' })
  await assert.taskCount({ status: 'backlog', count: 0 })
})

test('track full task lifecycle', async ({ act, query }) => {
  await act.createTask({ title: 'Fix login bug' })
  await act.assignTask({ title: 'Fix login bug', assignee: 'Alice' })
  await act.moveTask({ title: 'Fix login bug', status: 'in-progress' })

  const task = await query.taskDetails({ title: 'Fix login bug' })
  expect(task?.status).toBe('in-progress')
  expect(task?.assignee).toBe('Alice')
})

test('demo failure artifacts (set AVER_DEMO_FAIL=1)', async ({ assert }) => {
  if (process.env.AVER_DEMO_FAIL !== '1') return
  await assert.taskInStatus({ title: 'Nonexistent', status: 'done' })
})

test('visual approval of task board', async ({ act }) => {
  if (process.env.AVER_DEMO_APPROVAL !== '1' && process.env.AVER_DEMO_DIFF !== '1') return
  await act.createTask({ title: 'Review homepage' })
  if (process.env.AVER_DEMO_DIFF === '1') {
    await act.moveTask({ title: 'Review homepage', status: 'in-progress' })
  }
  await approve.visual('board-with-task')
})
