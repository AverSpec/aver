---
layout: default
title: Example App
nav_order: 9
parent: Guides
---

# Example: Task Board

The [`examples/task-board`](https://github.com/averspec/aver/tree/main/examples/task-board) directory contains a complete task board application tested with Aver across three adapters. It demonstrates the full three-layer architecture with a React frontend, Express API, and in-memory model.

## The App

A simple Kanban board with columns (backlog, in-progress, done) that supports creating, moving, assigning, and deleting tasks.

**Stack:** React 19, Express 5, TypeScript, Vite

## Domain Definition

The domain declares the testing vocabulary — what the task board does, independent of how:

```typescript
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

## Three Adapters

### Unit Adapter

Tests the `Board` class directly. Sub-millisecond execution.

```typescript
const unitAdapter = adapt(taskBoard, {
  protocol: unit(() => new Board()),
  actions: {
    createTask: async (board, { title, status }) => board.create(title, status),
    deleteTask: async (board, { title }) => board.delete(title),
    moveTask: async (board, { title, status }) => board.move(title, status),
    // ...
  },
  // ...
})
```

### HTTP Adapter

Tests the Express API via fetch. Spins up a server per test on a random port.

```typescript
const httpAdapter = adapt(taskBoard, {
  protocol: httpProtocol,  // custom protocol wrapping http()
  actions: {
    createTask: async (ctx, { title, status }) => {
      await ctx.post('/api/tasks', { title, status })
    },
    deleteTask: async (ctx, { title }) => {
      await ctx.delete(`/api/tasks/${encodeURIComponent(title)}`)
    },
    // ...
  },
  // ...
})
```

### Playwright Adapter

Tests the React UI in a headless Chromium browser. Serves the built frontend.

```typescript
const playwrightAdapter = adapt(taskBoard, {
  protocol: playwrightProtocol,  // launches browser + Express server
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
    // ...
  },
  // ...
})
```

## The Tests

The test file is protocol-agnostic. Every test runs against all three adapters automatically:

```typescript
const { test } = suite(taskBoard)

test('create a task in backlog', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix login bug' })
  await assert.taskInStatus({ title: 'Fix login bug', status: 'backlog' })
  await assert.taskCount({ status: 'backlog', count: 1 })
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
  expect(task?.status).toBe('in-progress') // import { expect } from 'vitest'
  expect(task?.assignee).toBe('Alice')
})
```

## Running It

```bash
# All adapters
npx aver run

# Single adapter
npx aver run --adapter unit
npx aver run --adapter http
npx aver run --adapter playwright
```

Output (all adapters):

```
 ✓ create a task in backlog [unit]            1ms
 ✓ create a task in backlog [http]           57ms
 ✓ create a task in backlog [playwright]   2808ms
 ✓ move task through workflow [unit]          1ms
 ✓ move task through workflow [http]         15ms
 ✓ move task through workflow [playwright]  395ms
 ✓ assign task to team member [unit]          0ms
 ✓ assign task to team member [http]         13ms
 ✓ assign task to team member [playwright]  403ms
 ✓ delete a task [unit]                       0ms
 ✓ delete a task [http]                       8ms
 ✓ delete a task [playwright]               371ms
 ✓ track full task lifecycle [unit]           1ms
 ✓ track full task lifecycle [http]          14ms
 ✓ track full task lifecycle [playwright]   440ms

 Tests  15 passed (15)
```

## Project Structure

```
examples/task-board/
  aver.config.ts              # Registers all 3 adapters
  domains/task-board.ts       # Domain definition
  adapters/
    task-board.unit.ts        # Unit adapter (Board class)
    task-board.http.ts        # HTTP adapter (Express API)
    task-board.playwright.ts  # Playwright adapter (React UI)
  tests/task-board.spec.ts    # Tests (protocol-agnostic)
  src/
    server/board.ts           # Board model
    server/routes.ts          # Express routes
    server/index.ts           # Server entry point
    app/App.tsx               # React frontend
```
