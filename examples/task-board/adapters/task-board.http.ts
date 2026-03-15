import { expect } from 'vitest'
import { implement, withFixture } from '@averspec/core'
import { http } from '@averspec/protocol-http'
import { createOtlpReceiver, type OtlpReceiver } from '@averspec/telemetry'
import { taskBoard } from '../domains/task-board.js'
import type { Server } from 'node:http'

// Defer tracing init so we can point the exporter at the OTLP receiver.
process.env.AVER_DEFER_TRACING_INIT = '1'

function createProtocol() {
  let server: Server | undefined
  let baseUrl = 'http://localhost:3000'
  let receiver: OtlpReceiver | undefined

  const httpProtocol = http({ get baseUrl() { return baseUrl } })

  const wrapped = withFixture(httpProtocol, {
    async before() {
      // Start the OTLP receiver first so we know its port.
      receiver = createOtlpReceiver()
      const receiverPort = await receiver.start()

      // Initialize OTel tracing to export to our receiver.
      const { initTracing } = await import('../src/server/tracing.js')
      initTracing(`http://localhost:${receiverPort}/v1/traces`)

      // Now start the Express server (tracing is active before any routes run).
      const { createServer } = await import('../src/server/index.js')
      const { app } = createServer()
      server = await new Promise<Server>(resolve => {
        const s = app.listen(0, () => resolve(s))
      })
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 3000
      baseUrl = `http://localhost:${port}`
    },
    async after() {
      // Shut down the Express server.
      if (server) {
        await new Promise<void>((resolve) => server!.close(() => resolve()))
        server = undefined
      }
      // Shut down tracing (flushes remaining spans).
      const { shutdownTracing } = await import('../src/server/tracing.js')
      await shutdownTracing()
      // Stop the OTLP receiver.
      if (receiver) {
        await receiver.stop()
        receiver = undefined
      }
    },
  })

  // Expose the telemetry collector on the protocol so Aver's test runner
  // can verify span expectations declared on domain markers.
  return {
    ...wrapped,
    get telemetry() { return receiver },
  }
}

const protocol = createProtocol()

export const httpAdapter = implement(taskBoard, {
  protocol,

  actions: {
    createTask: async (ctx, { title, status }) => {
      const res = await ctx.post('/api/tasks', { title, status })
      if (!res.ok) throw new Error(`Failed to create task: ${res.status}`)
      const { flushTracing } = await import('../src/server/tracing.js')
      await flushTracing()
    },
    deleteTask: async (ctx, { title }) => {
      const res = await ctx.delete(`/api/tasks/${encodeURIComponent(title)}`)
      if (!res.ok) throw new Error(`Failed to delete task: ${res.status}`)
    },
    moveTask: async (ctx, { title, status }) => {
      const res = await ctx.patch(`/api/tasks/${encodeURIComponent(title)}`, { status })
      if (!res.ok) throw new Error(`Failed to move task: ${res.status}`)
      const { flushTracing } = await import('../src/server/tracing.js')
      await flushTracing()
    },
    assignTask: async (ctx, { title, assignee }) => {
      const res = await ctx.patch(`/api/tasks/${encodeURIComponent(title)}`, { assignee })
      if (!res.ok) throw new Error(`Failed to assign task: ${res.status}`)
      // Drain the notification queue so async notification spans are emitted,
      // then flush all spans to the OTLP receiver.
      const { drainQueue } = await import('../src/server/notifications.js')
      await drainQueue()
      const { flushTracing } = await import('../src/server/tracing.js')
      await flushTracing()
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
