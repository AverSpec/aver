import { expect } from 'vitest'
import { implement, withFixture } from '@aver/core'
import { http } from '@aver/protocol-http'
import { taskBoard } from '../domains/task-board.js'
import { createServer } from '../src/server/index.js'
import type { Server } from 'node:http'

let server: Server | undefined
let baseUrl = 'http://localhost:3000'

const protocol = withFixture(
  http({ get baseUrl() { return baseUrl } }),
  {
    async before() {
      const { app } = createServer()
      server = await new Promise<Server>(resolve => {
        const s = app.listen(0, () => resolve(s))
      })
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 3000
      baseUrl = `http://localhost:${port}`
    },
    async after() {
      if (server) {
        await new Promise<void>((resolve) => server!.close(() => resolve()))
        server = undefined
      }
    },
  },
)

export const httpAdapter = implement(taskBoard, {
  protocol,

  actions: {
    createTask: async (ctx, { title, status }) => {
      const res = await ctx.post('/api/tasks', { title, status })
      if (!res.ok) throw new Error(`Failed to create task: ${res.status}`)
    },
    deleteTask: async (ctx, { title }) => {
      const res = await ctx.delete(`/api/tasks/${encodeURIComponent(title)}`)
      if (!res.ok) throw new Error(`Failed to delete task: ${res.status}`)
    },
    moveTask: async (ctx, { title, status }) => {
      const res = await ctx.patch(`/api/tasks/${encodeURIComponent(title)}`, { status })
      if (!res.ok) throw new Error(`Failed to move task: ${res.status}`)
    },
    assignTask: async (ctx, { title, assignee }) => {
      const res = await ctx.patch(`/api/tasks/${encodeURIComponent(title)}`, { assignee })
      if (!res.ok) throw new Error(`Failed to assign task: ${res.status}`)
    },
  },

  queries: {
    tasksByStatus: async (ctx, { status }) => {
      const res = await ctx.get(`/api/tasks?status=${encodeURIComponent(status)}`)
      return res.json()
    },
    taskDetails: async (ctx, { title }) => {
      const res = await ctx.get(`/api/tasks/${encodeURIComponent(title)}`)
      if (res.status === 404) return undefined
      return res.json()
    },
  },

  assertions: {
    taskInStatus: async (ctx, { title, status }) => {
      const res = await ctx.get(`/api/tasks/${encodeURIComponent(title)}`)
      expect(res.ok).toBe(true)
      const task = await res.json()
      expect(task.status).toBe(status)
    },
    taskAssignedTo: async (ctx, { title, assignee }) => {
      const res = await ctx.get(`/api/tasks/${encodeURIComponent(title)}`)
      expect(res.ok).toBe(true)
      const task = await res.json()
      expect(task.assignee).toBe(assignee)
    },
    taskCount: async (ctx, { status, count }) => {
      const res = await ctx.get(`/api/tasks?status=${encodeURIComponent(status)}`)
      const tasks = await res.json()
      expect(tasks).toHaveLength(count)
    },
  },
})
