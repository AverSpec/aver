import { implement, unit } from 'aver'
import { Board } from '../src/server/board.js'
import { taskBoard } from '../domains/task-board.js'

export const unitAdapter = implement(taskBoard, {
  protocol: unit(() => new Board()),

  actions: {
    createTask: async (board, { title, status }) => {
      board.create(title, status)
    },
    moveTask: async (board, { title, status }) => {
      board.move(title, status)
    },
    assignTask: async (board, { title, assignee }) => {
      board.assign(title, assignee)
    },
  },

  queries: {
    tasksByStatus: async (board, { status }) => {
      return board.byStatus(status)
    },
    taskDetails: async (board, { title }) => {
      return board.details(title)
    },
  },

  assertions: {
    taskInStatus: async (board, { title, status }) => {
      const task = board.details(title)
      if (!task) throw new Error(`Task "${title}" not found`)
      if (task.status !== status) {
        throw new Error(`Expected task "${title}" in "${status}" but was in "${task.status}"`)
      }
    },
    taskAssignedTo: async (board, { title, assignee }) => {
      const task = board.details(title)
      if (!task) throw new Error(`Task "${title}" not found`)
      if (task.assignee !== assignee) {
        throw new Error(`Expected task "${title}" assigned to "${assignee}" but was "${task.assignee}"`)
      }
    },
    taskCount: async (board, { status, count }) => {
      const tasks = board.byStatus(status)
      if (tasks.length !== count) {
        throw new Error(`Expected ${count} tasks in "${status}" but found ${tasks.length}`)
      }
    },
  },
})
