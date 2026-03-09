---
layout: default
title: Multi-Adapter Testing
parent: Guides
nav_order: 2
---

# Multi-Adapter Testing

Run the same test against multiple implementations — in-memory, HTTP API, and browser UI. Define behavior once, verify it everywhere.

## Setup

You need a domain and at least two adapters. This guide uses a task board example with three adapters.

### Domain

```typescript
// domains/task-board.ts
import { defineDomain, action, query, assertion } from '@aver/core'

export const taskBoard = defineDomain({
  name: 'task-board',
  actions: {
    createTask: action<{ title: string }>(),
    moveTask: action<{ title: string; status: string }>(),
  },
  assertions: {
    taskInStatus: assertion<{ title: string; status: string }>(),
  },
})
```

### Unit Adapter

Tests against in-memory objects. Runs in ~1ms.

```typescript
// adapters/task-board.unit.ts
import { implement, unit } from '@aver/core'
import { expect } from 'vitest'
import { Board } from '../src/board'
import { taskBoard } from '../domains/task-board'

export const unitAdapter = implement(taskBoard, {
  protocol: unit(() => new Board()),
  actions: {
    createTask: async (board, { title }) => board.create(title),
    moveTask: async (board, { title, status }) => board.move(title, status),
  },
  assertions: {
    taskInStatus: async (board, { title, status }) => {
      const task = board.details(title)
      expect(task?.status).toBe(status)
    },
  },
})
```

### HTTP Adapter

Tests against a REST API. Runs in ~10ms.

```typescript
// adapters/task-board.http.ts
import { implement } from '@aver/core'
import { expect } from 'vitest'
import { http } from '@aver/protocol-http'
import { taskBoard } from '../domains/task-board'

export const httpAdapter = implement(taskBoard, {
  protocol: http({ baseUrl: 'http://localhost:3000' }),
  actions: {
    createTask: async (ctx, { title }) => {
      await ctx.post('/tasks', { title })
    },
    moveTask: async (ctx, { title, status }) => {
      await ctx.patch(`/tasks/${encodeURIComponent(title)}`, { status })
    },
  },
  assertions: {
    taskInStatus: async (ctx, { title, status }) => {
      const res = await ctx.get(`/tasks/${encodeURIComponent(title)}`)
      const task = await res.json()
      expect(task.status).toBe(status)
    },
  },
})
```

### Playwright Adapter

Tests against a browser UI. Runs in ~300ms.

```typescript
// adapters/task-board.playwright.ts
import { implement } from '@aver/core'
import { playwright } from '@aver/protocol-playwright'
import { taskBoard } from '../domains/task-board'

export const playwrightAdapter = implement(taskBoard, {
  protocol: playwright(),
  actions: {
    createTask: async (page, { title }) => {
      await page.getByPlaceholder('Task title').fill(title)
      await page.getByRole('button', { name: 'Add' }).click()
    },
    moveTask: async (page, { title, status }) => {
      await page.getByTestId(`task-${title}`).dragTo(
        page.getByTestId(`column-${status}`)
      )
    },
  },
  assertions: {
    taskInStatus: async (page, { title, status }) => {
      const column = page.getByTestId(`column-${status}`)
      await expect(column.getByText(title)).toBeVisible()
    },
  },
})
```

## Register All Adapters

```typescript
// aver.config.ts
import { defineConfig } from '@aver/core'
import { unitAdapter } from './adapters/task-board.unit'
import { httpAdapter } from './adapters/task-board.http'
import { playwrightAdapter } from './adapters/task-board.playwright'

export default defineConfig({
  adapters: [unitAdapter, httpAdapter, playwrightAdapter],
})
```

## Write Tests Once

The test file imports the domain, never the adapters:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./aver.config.ts'],
  },
})
```

```typescript
// tests/task-board.spec.ts
import { suite } from '@aver/core'
import { taskBoard } from '../domains/task-board'

const { test } = suite(taskBoard)

test('create and move a task', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix login bug' })
  await assert.taskInStatus({ title: 'Fix login bug', status: 'backlog' })
  await act.moveTask({ title: 'Fix login bug', status: 'in-progress' })
  await assert.taskInStatus({ title: 'Fix login bug', status: 'in-progress' })
})
```

## Run

```bash
npx aver run
```

```
 ✓ tests/task-board.spec.ts
   ✓ create and move a task [unit]           1ms
   ✓ create and move a task [http]          14ms
   ✓ create and move a task [playwright]   312ms
```

One test, three adapters, three levels of confidence.

## Filtering

Run a specific adapter:

```bash
npx aver run --adapter unit
npx aver run --adapter http
```

Run a specific domain:

```bash
npx aver run --domain task-board
```
