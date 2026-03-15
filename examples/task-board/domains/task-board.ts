import { defineDomain, action, query, assertion } from '@averspec/core'
import type { Task } from '../src/server/board.js'

export type { Task }

export const taskBoard = defineDomain({
  name: 'task-board',
  actions: {
    createTask: action<{ title: string; status?: string }>({
      telemetry: (p) => ({
        span: 'task.create',
        attributes: { 'task.title': p.title },
      }),
    }),
    // deleteTask intentionally has no telemetry declaration — not every
    // operation needs to be traced. This shows that telemetry verification
    // only applies to markers that explicitly declare span expectations.
    deleteTask: action<{ title: string }>(),
    moveTask: action<{ title: string; status: string }>({
      telemetry: (p) => ({
        span: 'task.move',
        attributes: { 'task.title': p.title },
      }),
    }),
    assignTask: action<{ title: string; assignee: string }>({
      telemetry: (p) => ({
        span: 'task.assign',
        attributes: { 'task.title': p.title },
      }),
    }),
  },
  queries: {
    tasksByStatus: query<{ status: string }, Task[]>(),
    taskDetails: query<{ title: string }, Task | undefined>(),
  },
  assertions: {
    taskInStatus: assertion<{ title: string; status: string }>(),
    taskAssignedTo: assertion<{ title: string; assignee: string }>(),
    taskCount: assertion<{ status: string; count: number }>(),
  },
})
