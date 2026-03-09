---
layout: default
title: "Tutorial: Greenfield"
nav_order: 3
---

# Tutorial: Building a Domain from Scratch

This tutorial walks you through building a domain-driven test suite for a new feature. No legacy code, no approvals — just the clean path from domain vocabulary to multi-adapter tests. It takes about 10 minutes.

You'll build a task board tested at two levels:
1. Define a domain vocabulary in business language
2. Write tests that speak only domain language
3. Implement a unit adapter and see the tests pass
4. Add an HTTP adapter — the same tests, zero changes

---

## Step 1: Set up the project

```bash
mkdir task-board && cd task-board
npm init -y
npm install --save-dev @aver/core vitest typescript
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist"
  },
  "include": ["**/*.ts"]
}
```

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./aver.config.ts'],
  },
})
```

---

## Step 2: Define the domain

Before writing any implementation, name the behaviors. A task board lets you create tasks, move them between statuses, and verify where they are. Express that as a domain:

```typescript
// domains/task-board.ts
import { defineDomain, action, assertion } from '@aver/core'

export const taskBoard = defineDomain({
  name: 'task-board',
  actions: {
    createTask: action<{ title: string }>(),
    moveTask: action<{ title: string; status: string }>(),
  },
  queries: {},
  assertions: {
    taskInStatus: assertion<{ title: string; status: string }>(),
    taskCount: assertion<{ status: string; count: number }>(),
  },
})
```

Four operations. Two actions (create, move), two assertions (check status, count tasks). No implementation details — just the vocabulary of what a task board *does*.

This is the stable center. Tests and adapters will come and go; the domain vocabulary changes only when the business changes.

---

## Step 3: Write the tests first

Tests use domain language only. They don't know whether the task board is an in-memory object, a REST API, or a React app:

```typescript
// tests/task-board.spec.ts
import { suite } from '@aver/core'
import { taskBoard } from '../domains/task-board.js'

const { test } = suite(taskBoard)

test('new tasks land in backlog', async ({ when, then }) => {
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

test('multiple tasks in different statuses', async ({ given, when, then }) => {
  await given.createTask({ title: 'Bug A' })
  await given.createTask({ title: 'Bug B' })
  await when.moveTask({ title: 'Bug A', status: 'in-progress' })
  await then.taskCount({ status: 'backlog', count: 1 })
  await then.taskCount({ status: 'in-progress', count: 1 })
})
```

Notice the narrative structure: `given` sets up context, `when` performs the action under test, `then` verifies the outcome. These are aliases — `given` and `when` both call actions, `then` calls assertions — but the narrative makes tests read like specifications.

These tests won't pass yet. There's no adapter.

---

## Step 4: Build the unit adapter

An adapter binds domain vocabulary to a real implementation. Start with the `unit` protocol — in-memory, sub-millisecond:

```typescript
// adapters/task-board.unit.ts
import { implement, unit } from '@aver/core'
import { expect } from 'vitest'
import { taskBoard } from '../domains/task-board.js'

interface Task {
  title: string
  status: string
}

export const unitAdapter = implement(taskBoard, {
  protocol: unit((): { tasks: Task[] } => ({ tasks: [] })),
  actions: {
    createTask: async (ctx, { title }) => {
      ctx.tasks.push({ title, status: 'backlog' })
    },
    moveTask: async (ctx, { title, status }) => {
      const task = ctx.tasks.find(t => t.title === title)
      if (!task) throw new Error(`Task "${title}" not found`)
      task.status = status
    },
  },
  queries: {},
  assertions: {
    taskInStatus: async (ctx, { title, status }) => {
      const task = ctx.tasks.find(t => t.title === title)
      expect(task?.status).toBe(status)
    },
    taskCount: async (ctx, { status, count }) => {
      const actual = ctx.tasks.filter(t => t.status === status).length
      expect(actual).toBe(count)
    },
  },
})
```

The `unit()` function creates a fresh context for each test — here, an object with an empty `tasks` array. Each handler receives that context as its first argument.

TypeScript enforces completeness: miss a handler and you get a compile error. Every domain operation must be implemented.

Register the adapter:

```typescript
// aver.config.ts
import { defineConfig } from '@aver/core'
import { unitAdapter } from './adapters/task-board.unit.js'

export default defineConfig({
  adapters: [unitAdapter],
})
```

Run the tests:

```bash
npx aver run
```

```
 ✓ new tasks land in backlog [unit]              1ms
 ✓ move task through workflow [unit]             0ms
 ✓ multiple tasks in different statuses [unit]   0ms
```

Three tests, all passing against the unit adapter.

---

## Step 5: Add an HTTP adapter

Now suppose you're building an Express API for the task board. Here's a minimal server:

```typescript
// src/server.ts
import express from 'express'

const app = express()
app.use(express.json())

interface Task { title: string; status: string }
const tasks: Task[] = []

app.post('/tasks', (req, res) => {
  tasks.push({ title: req.body.title, status: 'backlog' })
  res.sendStatus(201)
})

app.patch('/tasks/:title', (req, res) => {
  const task = tasks.find(t => t.title === req.params.title)
  if (!task) return res.sendStatus(404)
  task.status = req.body.status
  res.sendStatus(200)
})

app.get('/tasks', (req, res) => {
  const status = req.query.status as string | undefined
  const filtered = status ? tasks.filter(t => t.status === status) : tasks
  res.json(filtered)
})

export function createApp() {
  const appTasks: Task[] = []
  const app = express()
  app.use(express.json())

  app.post('/tasks', (req, res) => {
    appTasks.push({ title: req.body.title, status: 'backlog' })
    res.sendStatus(201)
  })

  app.patch('/tasks/:title', (req, res) => {
    const task = appTasks.find(t => t.title === req.params.title)
    if (!task) return res.sendStatus(404)
    task.status = req.body.status
    res.sendStatus(200)
  })

  app.get('/tasks', (req, res) => {
    const status = req.query.status as string | undefined
    const filtered = status ? appTasks.filter(t => t.status === status) : appTasks
    res.json(filtered)
  })

  return app
}
```

Write an HTTP adapter for the same domain:

```typescript
// adapters/task-board.http.ts
import { implement } from '@aver/core'
import { expect } from 'vitest'
import { taskBoard } from '../domains/task-board.js'
import { createApp } from '../src/server.js'
import type { Protocol } from '@aver/core'

interface HttpContext {
  baseUrl: string
  server: any
}

const protocol: Protocol<HttpContext> = {
  name: 'http',
  async setup() {
    const app = createApp()
    const server = app.listen(0)
    const port = (server.address() as any).port
    return { baseUrl: `http://localhost:${port}`, server }
  },
  async teardown(ctx) {
    ctx.server.close()
  },
}

export const httpAdapter = implement(taskBoard, {
  protocol,
  actions: {
    createTask: async (ctx, { title }) => {
      await fetch(`${ctx.baseUrl}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
    },
    moveTask: async (ctx, { title, status }) => {
      await fetch(`${ctx.baseUrl}/tasks/${encodeURIComponent(title)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
    },
  },
  queries: {},
  assertions: {
    taskInStatus: async (ctx, { title, status }) => {
      const res = await fetch(`${ctx.baseUrl}/tasks`)
      const tasks = await res.json() as Array<{ title: string; status: string }>
      const task = tasks.find(t => t.title === title)
      expect(task?.status).toBe(status)
    },
    taskCount: async (ctx, { status, count }) => {
      const res = await fetch(`${ctx.baseUrl}/tasks?status=${encodeURIComponent(status)}`)
      const tasks = await res.json() as Array<{ title: string; status: string }>
      expect(tasks.length).toBe(count)
    },
  },
})
```

Register both adapters:

```typescript
// aver.config.ts
import { defineConfig } from '@aver/core'
import { unitAdapter } from './adapters/task-board.unit.js'
import { httpAdapter } from './adapters/task-board.http.js'

export default defineConfig({
  adapters: [unitAdapter, httpAdapter],
})
```

Run the tests — **the same tests, no changes**:

```bash
npx aver run
```

```
 ✓ new tasks land in backlog [unit]                1ms
 ✓ new tasks land in backlog [http]               18ms
 ✓ move task through workflow [unit]               0ms
 ✓ move task through workflow [http]              12ms
 ✓ multiple tasks in different statuses [unit]     0ms
 ✓ multiple tasks in different statuses [http]    15ms
```

Three tests. Two adapters. Six runs. The test code didn't change — only the config did.

If the unit adapter and HTTP adapter ever disagree on a behavior, that disagreement surfaces a real bug. The unit adapter says what the logic should do. The HTTP adapter says what the API actually does. When they match, you have confidence at two levels.

---

## What you built

```
domains/task-board.ts           # Domain — what a task board does
adapters/task-board.unit.ts     # Unit adapter — in-memory
adapters/task-board.http.ts     # HTTP adapter — Express API
tests/task-board.spec.ts        # Tests — domain language only
aver.config.ts                  # Config — registers adapters
```

The domain vocabulary is the stable center. Tests compose vocabulary into scenarios. Adapters are interchangeable. When the UI exists, add a Playwright adapter — the tests still don't change.

## Next steps

- [Tutorial: Legacy Code](tutorial) — start from untested code with characterization tests
- [Architecture](architecture) — how the three-layer model works and why
- [Multi-Adapter Testing](guides/multi-adapter) — adding Playwright, filtering by adapter
- [Telemetry Tutorial](tutorial-telemetry) — add observability verification
- [Example Mapping](guides/example-mapping) — discover domain vocabulary through structured conversation
