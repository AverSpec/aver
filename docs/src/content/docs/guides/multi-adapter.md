---
title: "Multi-Adapter Testing"
---

Run the same test against multiple implementations — direct code interfaces, HTTP API, and browser UI. Define behavior once, verify it everywhere.

Why bother with multiple levels instead of just E2E? Because good design at the domain boundary changes the economics. When your domain objects have clean public interfaces — service objects with intentional methods — your HTTP controllers and browser handlers become thin translation layers. The real logic lives in one place. The unit adapter tests that logic fast. The HTTP and browser adapters verify that the thin layers shuttle data correctly, not that the business rules work. You get the confidence of E2E with the speed of unit tests for your inner development loop.

## Setup

You need a domain and at least two adapters. This guide uses a task board example with three adapters.

### Domain

```typescript
// domains/task-board.ts
import { defineDomain, action, query, assertion } from '@averspec/core'

export const taskBoard = defineDomain({
  name: 'task-board',
  actions: {
    createTask: action<{ title: string }>(),
    moveTask: action<{ title: string; status: string }>(),
  },
  queries: {},
  assertions: {
    taskInStatus: assertion<{ title: string; status: string }>(),
  },
})
```

### Unit Adapter

Tests against your code's public interfaces directly. Fast — how fast depends on your design choices (see [Making unit adapters fast](#making-unit-adapters-fast) below).

```typescript
// adapters/task-board.unit.ts
import { adapt, unit } from '@averspec/core'
import { expect } from 'vitest'
import { Board } from '../src/board'
import { taskBoard } from '../domains/task-board'

export const unitAdapter = adapt(taskBoard, {
  protocol: unit(() => new Board()),
  actions: {
    createTask: async (board, { title }) => board.create(title),
    moveTask: async (board, { title, status }) => board.move(title, status),
  },
  queries: {},
  assertions: {
    taskInStatus: async (board, { title, status }) => {
      const task = board.details(title)
      expect(task?.status).toBe(status)
    },
  },
})
```

### HTTP Adapter

Tests against a REST API. Faster than the browser, slower than direct interfaces.

```typescript
// adapters/task-board.http.ts
import { adapt } from '@averspec/core'
import { expect } from 'vitest'
import { http } from '@averspec/protocol-http'
import { taskBoard } from '../domains/task-board'

export const httpAdapter = adapt(taskBoard, {
  protocol: http({ baseUrl: 'http://localhost:3000' }),
  actions: {
    createTask: async (ctx, { title }) => {
      await ctx.post('/tasks', { title })
    },
    moveTask: async (ctx, { title, status }) => {
      await ctx.patch(`/tasks/${encodeURIComponent(title)}`, { status })
    },
  },
  queries: {},
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

Tests against a browser UI. Slowest adapter, highest confidence.

```typescript
// adapters/task-board.playwright.ts
import { adapt } from '@averspec/core'
import { expect } from '@playwright/test'
import { playwright } from '@averspec/protocol-playwright'
import { taskBoard } from '../domains/task-board'

export const playwrightAdapter = adapt(taskBoard, {
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
  queries: {},
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
import { defineConfig } from '@averspec/core'
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
import { suite } from '@averspec/core'
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

## Making unit adapters fast

The unit adapter is your inner development loop. The faster it runs, the tighter your feedback. The question is how to handle the IO dependencies that sit behind your domain objects.

### Nullables

Replace IO dependencies with [nullable implementations](https://www.jamesshore.com/v2/projects/nullables) that work in-memory by default. Your production code accepts either the real thing or the nullable; no mocking framework required.

```typescript
// src/task-repo.ts
export class TaskRepo {
  constructor(private db: Database | null = null) {}

  async create(title: string) {
    if (!this.db) {
      this.tasks.push({ title, status: 'backlog' })
      return
    }
    await this.db.insert('tasks', { title, status: 'backlog' })
  }

  // In-memory fallback — no IO, sub-millisecond
  private tasks: Array<{ title: string; status: string }> = []
}
```

```typescript
// adapters/task-board.unit.ts — no database, no mocks
protocol: unit(() => new TaskRepo())  // null db → in-memory
```

This is the fastest option — no IO means no waiting. The trade-off: you're testing the in-memory path, not the database path. That's what the HTTP and Playwright adapters are for.

### Dependency injection

Pass dependencies into your domain objects. Swap real implementations for fast fakes in the unit adapter. ([Fowler on DI](https://martinfowler.com/articles/injection.html))

```typescript
// src/board.ts
export class Board {
  constructor(private repo: TaskRepo) {}

  async create(title: string) {
    await this.repo.create(title)
  }
}

// adapters/task-board.unit.ts
protocol: unit(() => new Board(new InMemoryTaskRepo()))
```

Similar speed to nullables — no real IO in the test path. The difference is structural: DI puts the seam at the constructor boundary, nullables put it inside the class. DI is more conventional; nullables are simpler when you control the dependency.

### Vitest mocks

Use `vi.fn()` or `vi.mock()` to stub out IO at the module level. Fastest to set up for existing code that wasn't designed for injection.

```typescript
import { vi } from 'vitest'
import * as db from '../src/db'

vi.spyOn(db, 'insert').mockResolvedValue(undefined)
vi.spyOn(db, 'findOne').mockResolvedValue({ title: 'Fix bug', status: 'backlog' })

protocol: unit(() => new Board())  // Board calls db internally, gets mocks
```

Fast but brittle — the mocks are coupled to internal implementation details. ([Fowler: Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html)) When someone renames `db.insert` to `db.save`, the mock breaks even though the behavior hasn't changed. Use this as a stepping stone, not a destination.

### Fake local services

Run a lightweight in-process version of your dependency. SQLite instead of Postgres, an in-memory Express server instead of a remote API.

```typescript
import Database from 'better-sqlite3'

protocol: unit(() => {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE tasks (title TEXT, status TEXT)')
  return new Board(db)
})
```

Slower — there's real IO happening — but higher fidelity. You're testing real SQL, real query behavior. Good for domains where the database behavior *is* the business logic (complex queries, transactions, constraints).

### Replay proxies / fixtures

Record real HTTP responses and replay them in tests. Tools like [Polly.js](https://netflix.github.io/pollyjs/) or [MSW](https://mswjs.io/) intercept network calls and serve recorded fixtures.

```typescript
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

const server = setupServer(
  http.post('/api/tasks', () => HttpResponse.json({ id: '1' })),
  http.get('/api/tasks/:title', ({ params }) =>
    HttpResponse.json({ title: params.title, status: 'backlog' })
  ),
)

beforeAll(() => server.listen())
afterAll(() => server.close())
```

Faster than hitting the real service, slower than pure in-memory. Good for adapters that wrap third-party APIs you don't control. Record once against the real service, replay in CI forever.

### Choosing a strategy

| Strategy | Speed | Fidelity | Setup cost | Best for |
|----------|-------|----------|------------|----------|
| Nullables | Fastest — no IO | Lower — tests in-memory path | Low | Code you control, fast inner loop |
| Dependency injection | Fastest — no IO | Lower — tests fake path | Medium | Established DI patterns |
| Vitest mocks | Fastest — no IO | Lowest — coupled to internals | Low | Legacy code, temporary |
| Fake local services | Moderate — real IO | Higher — real query behavior | Medium | DB-heavy domains |
| Replay proxies | Moderate — intercepted IO | Medium — recorded real responses | Medium | Third-party APIs |

You can mix strategies. Use nullables for the inner development loop, a fake database for integration-sensitive domains, and replay proxies for external API adapters. The point is: each adapter level gives you a different trade-off between speed and fidelity. Make the unit adapter as fast as your design allows.
