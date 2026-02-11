# Aver Code Patterns

Complete code examples for every Aver pattern.

## Domain Definition

A domain declares the vocabulary of your system — what can be done (actions), what can be observed (queries), and what must be true (assertions).

```typescript
import { defineDomain, action, query, assertion } from 'aver'

// Type parameter = payload shape. These are phantom types (erased at runtime).
// action<Payload>() — Payload is what the test passes in
// query<Payload, Return>() — Payload is the input, Return is what comes back
// assertion<Payload>() — Payload is what the test passes in (handler throws on failure)

export interface Task {
  title: string
  status: string
  assignee?: string
}

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
```

## Unit Adapter

The unit adapter tests business logic directly, with no I/O. The `unit()` protocol takes a factory function that creates fresh state for each test.

```typescript
import { implement, unit } from 'aver'
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
```

## HTTP Adapter

The HTTP adapter tests through your API. Each handler makes HTTP requests and checks responses.

```typescript
import { implement } from 'aver'
import { http } from '@aver/protocol-http'
import { taskBoard } from '../domains/task-board.js'
import { createServer } from '../src/server/index.js'
import type { Server } from 'node:http'
import type { HttpContext } from '@aver/protocol-http'

let server: Server | undefined

const httpProtocol = {
  name: 'http',
  async setup(): Promise<HttpContext> {
    const { app } = createServer()
    server = await new Promise<Server>(resolve => {
      const s = app.listen(0, () => resolve(s))
    })
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 3000
    return http({ baseUrl: `http://localhost:${port}` }).setup()
  },
  async teardown() {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
      server = undefined
    }
  },
}

export const httpAdapter = implement(taskBoard, {
  protocol: httpProtocol,

  actions: {
    createTask: async (ctx, { title, status }) => {
      const res = await ctx.post('/api/tasks', { title, status })
      if (!res.ok) throw new Error(`Failed to create task: ${res.status}`)
    },
    deleteTask: async (ctx, { title }) => {
      const res = await ctx.delete(`/api/tasks/${encodeURIComponent(title)}`)
      if (!res.ok) throw new Error(`Failed to delete task: ${res.status}`)
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
      if (!res.ok) throw new Error(`Task "${title}" not found`)
      const task = await res.json()
      if (task.status !== status) {
        throw new Error(`Expected task "${title}" in "${status}" but was in "${task.status}"`)
      }
    },
    // ... same pattern for other assertions
  },
})
```

## Playwright Adapter

The Playwright adapter tests through the browser UI.

```typescript
import { implement } from 'aver'
import { taskBoard } from '../domains/task-board.js'
import type { Page } from 'playwright'

const playwrightProtocol = {
  name: 'playwright',
  async setup(): Promise<Page> {
    // Launch server + browser, return a Page
    // See examples/task-board/adapters/task-board.playwright.ts for full setup
  },
  async teardown(page: Page) {
    await page.close()
  },
}

export const playwrightAdapter = implement(taskBoard, {
  protocol: playwrightProtocol,

  actions: {
    createTask: async (page, { title }) => {
      await page.getByTestId('new-task-title').fill(title)
      await page.getByTestId('create-task-btn').click()
      await page.getByTestId(`task-${title}`).waitFor()
    },
    deleteTask: async (page, { title }) => {
      await page.getByTestId(`task-${title}`).getByTestId('delete-btn').click()
      await page.getByTestId(`task-${title}`).waitFor({ state: 'detached' })
    },
  },

  queries: {
    taskDetails: async (page, { title }) => {
      const card = page.getByTestId(`task-${title}`)
      if ((await card.count()) === 0) return undefined
      const status = await card.getAttribute('data-status') ?? ''
      return { title, status }
    },
  },

  assertions: {
    taskInStatus: async (page, { title, status }) => {
      const card = page.getByTestId(`column-${status}`).getByTestId(`task-${title}`)
      if ((await card.count()) === 0) {
        throw new Error(`Expected task "${title}" in column "${status}" but not found`)
      }
    },
  },
})
```

## Test File

Tests use `suite()` which returns `test`, `act`, `query`, `assert`. The `test` callback receives proxies scoped to that test run.

```typescript
import { expect } from 'vitest'
import { suite } from 'aver'
import { taskBoard } from '../domains/task-board.js'

// Config import auto-registers adapters
import '../aver.config.js'

// suite(domain) without a specific adapter → runs all registered adapters
const { test } = suite(taskBoard)

test('create a task in backlog', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix login bug' })
  await assert.taskInStatus({ title: 'Fix login bug', status: 'backlog' })
  await assert.taskCount({ status: 'backlog', count: 1 })
})

test('track full task lifecycle', async ({ act, query }) => {
  await act.createTask({ title: 'Fix login bug' })
  await act.assignTask({ title: 'Fix login bug', assignee: 'Alice' })
  await act.moveTask({ title: 'Fix login bug', status: 'in-progress' })

  const task = await query.taskDetails({ title: 'Fix login bug' })
  expect(task?.status).toBe('in-progress')
  expect(task?.assignee).toBe('Alice')
})
```

## Config File

```typescript
import { defineConfig } from 'aver'
import { unitAdapter } from './adapters/task-board.unit.js'
import { httpAdapter } from './adapters/task-board.http.js'
import { playwrightAdapter } from './adapters/task-board.playwright.js'

export default defineConfig({
  adapters: [unitAdapter, httpAdapter, playwrightAdapter],
})
```

## Assertion Patterns

Assertions always **throw** on failure — they never return booleans.

```typescript
// CORRECT — throw with a descriptive message
taskInStatus: async (state, { title, status }) => {
  const task = state.find(title)
  if (!task) throw new Error(`Task "${title}" not found`)
  if (task.status !== status) {
    throw new Error(`Expected "${title}" in "${status}" but was "${task.status}"`)
  }
},

// WRONG — don't return booleans
taskInStatus: async (state, { title, status }) => {
  const task = state.find(title)
  return task?.status === status  // ← this won't cause test failure
},
```

## Handler Signatures

All handlers follow the same pattern: `async (context, payload) => returnValue`

- **Actions**: `async (ctx, payload) => void` — perform side effects
- **Queries**: `async (ctx, payload) => ReturnType` — return data, no side effects
- **Assertions**: `async (ctx, payload) => void` — throw on failure
