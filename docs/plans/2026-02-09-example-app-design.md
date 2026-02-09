# Task Board Example App + Core API Changes

**Date**: 2026-02-09
**Status**: Design approved, ready for implementation

## Context

Aver needs a real-world example that demonstrates the framework end-to-end before writing docs. The example should make the "same test, three adapters" value prop immediately obvious.

## Decisions

- **Domain**: Task tracker (Linear-style) — state transitions make acceptance tests compelling
- **Frontend**: React + Vite SPA (kanban board)
- **Backend**: Express JSON API + serves built SPA
- **Adapters**: direct, http, playwright — all three
- **Vocabulary**: Minimal (~8 entries)
- **Test callback API**: `{ act, query, assert, trace }` — three verb-prefixed namespace proxies instead of flat `domain.*`

## Build Order

### Step 1: Core API Change — `{ act, query, assert }`

Replace `{ domain, trace }` callback with `{ act, query, assert, trace }`.

**Changes:**
- `packages/aver/src/core/suite.ts` — build three separate proxies per vocabulary kind instead of one flat `DomainProxy`
- `packages/aver/src/core/suite.ts` — update `TestContext` type to `{ act, query, assert, trace }`
- `packages/aver/src/index.ts` — update type exports
- All existing tests — `{ domain }` → `{ act, query, assert }` (or whichever subset they use)
- MCP server adapter handlers — they reference `suiteInstance.domain`, need to adapt
- Dogfood adapters — vocabulary references change

**Verification:** All 88 tests pass with new API.

### Step 2: `@aver/protocol-http` Package

Thin wrapper around native `fetch`. No dependencies.

```
packages/protocol-http/
  package.json
  tsconfig.json
  tsup.config.ts
  src/
    index.ts
  test/
    http.spec.ts
```

**Public API:**

```typescript
import { http } from '@aver/protocol-http'

export interface HttpContext {
  get(path: string): Promise<Response>
  post(path: string, body?: unknown): Promise<Response>
  patch(path: string, body?: unknown): Promise<Response>
  delete(path: string): Promise<Response>
}

export interface HttpOptions {
  baseUrl: string
}

export function http(options: HttpOptions): Protocol<HttpContext>
```

Protocol name: `'http'`. Setup creates the context with fetch helpers. Teardown is a no-op.

**Verification:** Unit tests pass. Package builds with tsup (dual ESM/CJS + DTS).

### Step 3: Example App — Task Board

```
examples/e-commerce/
  package.json
  vite.config.ts
  aver.config.ts
  src/
    app/
      main.tsx
      App.tsx
      pages/
        BoardPage.tsx
      components/
        Column.tsx
        TaskCard.tsx
        CreateTaskForm.tsx
    server/
      index.ts              # Express — JSON API + serves built SPA
      board.ts              # Pure task board logic (in-memory)
      routes.ts             # REST endpoints wrapping board.ts
  domains/
    task-board.ts
  adapters/
    task-board.direct.ts
    task-board.http.ts
    task-board.playwright.ts
  tests/
    task-board.spec.ts
```

#### Domain Vocabulary

```typescript
const taskBoard = defineDomain({
  name: 'task-board',
  actions: {
    createTask:  action<{ title: string; status?: string }>(),
    moveTask:    action<{ title: string; status: string }>(),
    assignTask:  action<{ title: string; assignee: string }>(),
  },
  queries: {
    tasksByStatus: query<{ status: string }, Task[]>(),
    taskDetails:   query<{ title: string }, Task>(),
  },
  assertions: {
    taskInStatus:    assertion<{ title: string; status: string }>(),
    taskAssignedTo:  assertion<{ title: string; assignee: string }>(),
    taskCount:       assertion<{ status: string; count: number }>(),
  },
})
```

#### Test File

```typescript
import { expect } from 'vitest'
import { suite } from 'aver'
import { taskBoard } from '../domains/task-board'

const { test } = suite(taskBoard)

test('create a task in backlog', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix login bug' })
  await assert.taskInStatus({ title: 'Fix login bug', status: 'backlog' })
  await assert.taskCount({ status: 'backlog', count: 1 })
})

test('move task through workflow', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix login bug' })
  await act.moveTask({ title: 'Fix login bug', status: 'in-progress' })
  await assert.taskInStatus({ title: 'Fix login bug', status: 'in-progress' })
  await assert.taskCount({ status: 'backlog', count: 0 })
})

test('assign task to team member', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix login bug' })
  await act.assignTask({ title: 'Fix login bug', assignee: 'Alice' })
  await assert.taskAssignedTo({ title: 'Fix login bug', assignee: 'Alice' })
})

test('track full task lifecycle', async ({ act, query }) => {
  await act.createTask({ title: 'Fix login bug' })
  await act.assignTask({ title: 'Fix login bug', assignee: 'Alice' })
  await act.moveTask({ title: 'Fix login bug', status: 'in-progress' })

  const task = await query.taskDetails({ title: 'Fix login bug' })
  expect(task.status).toBe('in-progress')
  expect(task.assignee).toBe('Alice')
})
```

#### API Endpoints (Express)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/tasks` | Create task (defaults to `backlog`) |
| PATCH | `/api/tasks/:id` | Update task (move/assign) |
| GET | `/api/tasks?status=x` | List tasks by status |
| GET | `/api/tasks/:id` | Get task details |

#### React SPA

Single-page kanban board:
- Three columns: backlog, in-progress, done
- Task cards showing title + assignee
- "Move" buttons on cards to transition between columns
- Create task form at the top
- Minimal styling — enough to look like a real board

#### Adapter Protocols

- **direct** — instantiates `board.ts` in-memory via `direct()`, no server
- **http** — starts Express in `setup()`, calls REST API via `http({ baseUrl })`, stops server in `teardown()`
- **playwright** — starts Express + launches browser in `setup()`, drives React UI, tears both down

#### Config

```typescript
// aver.config.ts
import { defineConfig } from 'aver'
import { directAdapter } from './adapters/task-board.direct'
import { httpAdapter } from './adapters/task-board.http'
import { playwrightAdapter } from './adapters/task-board.playwright'

export default defineConfig({
  adapters: [directAdapter, httpAdapter, playwrightAdapter]
})
```

#### Expected Test Output

```
 ✓ create a task in backlog [direct]
 ✓ create a task in backlog [http]
 ✓ create a task in backlog [playwright]
 ✓ move task through workflow [direct]
 ✓ move task through workflow [http]
 ✓ move task through workflow [playwright]
 ✓ assign task to team member [direct]
 ✓ assign task to team member [http]
 ✓ assign task to team member [playwright]
 ✓ track full task lifecycle [direct]
 ✓ track full task lifecycle [http]
 ✓ track full task lifecycle [playwright]
```
