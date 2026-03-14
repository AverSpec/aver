import { defineDomain, action, query, assertion } from '@averspec/core'
import type { Task } from '../src/server/board.js'

export type { Task }

export const taskBoard = defineDomain({
  name: 'task-board',
  actions: {
    createTask: action<{ title: string; status?: string }>(),
    deleteTask: action<{ title: string }>(),
    moveTask: action<{ title: string; status: string }>(),
    assignTask: action<{ title: string; assignee: string }>(),
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
