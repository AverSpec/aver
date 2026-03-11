import { expect } from 'vitest'
import { implement, unit } from '@aver/core'
import { Board } from '../src/server/board.js'
import { taskBoard } from '../domains/task-board.js'

export const unitAdapter = implement(taskBoard, {
  protocol: unit(() => new Board()),

  actions: {
    createTask: async (board, { title, status }) => {
      board.create(title, status)
    },
    deleteTask: async (board, { title }) => {
      board.delete(title)
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
      expect(task).toBeDefined()
      expect(task!.status).toBe(status)
    },
    taskAssignedTo: async (board, { title, assignee }) => {
      const task = board.details(title)
      expect(task).toBeDefined()
      expect(task!.assignee).toBe(assignee)
    },
    taskCount: async (board, { status, count }) => {
      const tasks = board.byStatus(status)
      expect(tasks).toHaveLength(count)
    },
  },
})
