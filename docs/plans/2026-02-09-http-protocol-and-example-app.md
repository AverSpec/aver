# HTTP Protocol + Task Board Example App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `@aver/protocol-http` package and a task board example app that demonstrates Aver end-to-end with three adapters (direct, http, playwright).

**Architecture:** The HTTP protocol is a thin fetch wrapper matching the playwright protocol pattern. The example app has an Express JSON API, a React+Vite SPA, and three Aver adapters that all run the same test file. A prerequisite core change adds query input parameters so queries like `tasksByStatus({ status: 'backlog' })` work.

**Tech Stack:** TypeScript 5.7+, Vitest, tsup, Express, React 19, Vite, Playwright

---

### Task 1: Add query input parameters to core

**Why:** Queries currently only have a return type — `query<R>()` produces `() => Promise<R>`. The example needs queries that accept input: `tasksByStatus({ status: string })` and `taskDetails({ title: string })`. This requires changes to the marker, type system, proxy builder, and adapter handler types.

**Files:**
- Modify: `packages/aver/src/core/types.ts`
- Modify: `packages/aver/src/core/markers.ts`
- Modify: `packages/aver/src/core/adapter.ts`
- Modify: `packages/aver/src/core/suite.ts`
- Modify: `packages/aver/test/core/suite.spec.ts`

**Step 1: Update QueryMarker to support input type**

In `packages/aver/src/core/types.ts`, change:
```typescript
export interface QueryMarker<R = unknown> {
  readonly kind: 'query'
  readonly __return?: R
}
```
To:
```typescript
export interface QueryMarker<P = void, R = unknown> {
  readonly kind: 'query'
  readonly __payload?: P
  readonly __return?: R
}
```

**Step 2: Update query() marker factory**

In `packages/aver/src/core/markers.ts`, change:
```typescript
export function query<R = unknown>(): QueryMarker<R> {
  return { kind: 'query' } as QueryMarker<R>
}
```
To:
```typescript
export function query<P = void, R = unknown>(): QueryMarker<P, R> {
  return { kind: 'query' } as QueryMarker<P, R>
}
```

**Step 3: Update QueryProxy type in suite.ts**

In `packages/aver/src/core/suite.ts`, change:
```typescript
export type QueryProxy<D extends Domain> = {
  [K in keyof D['vocabulary']['queries']]:
    D['vocabulary']['queries'][K] extends { __return?: infer R }
      ? () => Promise<R>
      : never
}
```
To:
```typescript
export type QueryProxy<D extends Domain> = {
  [K in keyof D['vocabulary']['queries']]:
    D['vocabulary']['queries'][K] extends { __payload?: infer P; __return?: infer R }
      ? [P] extends [void] ? () => Promise<R> : (payload: P) => Promise<R>
      : never
}
```

**Step 4: Update query proxy builder in createProxies**

In `packages/aver/src/core/suite.ts`, the query loop currently has:
```typescript
query[name] = async () => {
  const a = getAdapter()
  const entry: TraceEntry = { kind: 'query', name, payload: undefined, status: 'pass' }
  try {
    const result = await (a.handlers.queries as any)[name](getCtx())
```

Change to (matching the action/assertion pattern):
```typescript
query[name] = async (payload?: any) => {
  const a = getAdapter()
  const entry: TraceEntry = { kind: 'query', name, payload, status: 'pass' }
  try {
    const result = payload !== undefined
      ? await (a.handlers.queries as any)[name](getCtx(), payload)
      : await (a.handlers.queries as any)[name](getCtx())
```

**Step 5: Update QueryHandler type in adapter.ts**

In `packages/aver/src/core/adapter.ts`, change:
```typescript
type QueryHandler<Ctx, M> =
  M extends QueryMarker<infer R>
    ? (ctx: Ctx) => Promise<R>
    : never
```
To:
```typescript
type QueryHandler<Ctx, M> =
  M extends QueryMarker<infer P, infer R>
    ? P extends void
      ? (ctx: Ctx) => Promise<R>
      : (ctx: Ctx, payload: P) => Promise<R>
    : never
```

**Step 6: Update VocabMarker and utility types in types.ts**

In `packages/aver/src/core/types.ts`, update `VocabMarker`:
```typescript
export type VocabMarker = ActionMarker<any> | QueryMarker<any, any> | AssertionMarker<any>
```

**Step 7: Add a test for parameterized queries**

In `packages/aver/test/core/suite.spec.ts`, add a new test in the `suite() — programmatic API` describe block (after the existing query test):

```typescript
it('dispatches parameterized queries through adapter', async () => {
  const filterDomain = defineDomain({
    name: 'Filter',
    actions: {},
    queries: {
      itemsByStatus: query<{ status: string }, string[]>(),
    },
    assertions: {},
  })
  const items = { active: ['a', 'b'], done: ['c'] }
  const filterAdapter = implement(filterDomain, {
    protocol: testProtocol,
    actions: {},
    queries: {
      itemsByStatus: async (_ctx, { status }) => items[status as keyof typeof items] ?? [],
    },
    assertions: {},
  })

  const s = suite(filterDomain, filterAdapter)
  await s.setup()

  const result = await s.query.itemsByStatus({ status: 'active' })
  expect(result).toEqual(['a', 'b'])

  const trace = s.getTrace()
  expect(trace[0]).toMatchObject({
    kind: 'query',
    name: 'itemsByStatus',
    payload: { status: 'active' },
    status: 'pass',
  })

  await s.teardown()
})
```

**Step 8: Run tests**

Run: `npm test -w packages/aver`
Expected: All tests pass (49 existing + 1 new = 50).

**Step 9: Rebuild core**

Run: `npm run build -w packages/aver`

**Step 10: Run MCP server tests to verify no regressions**

Run: `npm test -w packages/mcp-server`
Expected: All 37 tests pass.

**Step 11: Commit**

```bash
git add packages/aver/src/ packages/aver/test/core/suite.spec.ts
git commit -m "feat: add query input parameters — query<Payload, Return>()"
```

---

### Task 2: Create `@aver/protocol-http` package

**Files:**
- Create: `packages/protocol-http/package.json`
- Create: `packages/protocol-http/tsconfig.json`
- Create: `packages/protocol-http/tsup.config.ts`
- Create: `packages/protocol-http/src/index.ts`
- Create: `packages/protocol-http/test/http.spec.ts`

**Step 1: Create package.json**

Create `packages/protocol-http/package.json`:
```json
{
  "name": "@aver/protocol-http",
  "version": "0.1.0",
  "description": "HTTP protocol for Aver acceptance testing",
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=18.0.0" },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "aver": "*"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "aver": "*"
  }
}
```

**Step 2: Create tsconfig.json**

Create `packages/protocol-http/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.spec.ts"]
}
```

**Step 3: Create tsup.config.ts**

Create `packages/protocol-http/tsup.config.ts`:
```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['aver'],
})
```

**Step 4: Create the implementation**

Create `packages/protocol-http/src/index.ts`:
```typescript
import type { Protocol } from 'aver'

export interface HttpContext {
  get(path: string): Promise<Response>
  post(path: string, body?: unknown): Promise<Response>
  put(path: string, body?: unknown): Promise<Response>
  patch(path: string, body?: unknown): Promise<Response>
  delete(path: string): Promise<Response>
}

export interface HttpOptions {
  baseUrl: string
}

export function http(options: HttpOptions): Protocol<HttpContext> {
  return {
    name: 'http',
    async setup(): Promise<HttpContext> {
      const base = options.baseUrl.replace(/\/$/, '')

      function request(method: string) {
        return async (path: string, body?: unknown): Promise<Response> => {
          return fetch(`${base}${path}`, {
            method,
            headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
            body: body !== undefined ? JSON.stringify(body) : undefined,
          })
        }
      }

      return {
        get: request('GET'),
        post: request('POST'),
        put: request('PUT'),
        patch: request('PATCH'),
        delete: request('DELETE'),
      }
    },
    async teardown() {},
  }
}
```

**Step 5: Create unit tests**

Create `packages/protocol-http/test/http.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { http } from '../src/index'

describe('http()', () => {
  it('creates a protocol with name "http"', () => {
    const protocol = http({ baseUrl: 'http://localhost:3000' })
    expect(protocol.name).toBe('http')
    expect(typeof protocol.setup).toBe('function')
    expect(typeof protocol.teardown).toBe('function')
  })

  it('setup returns context with HTTP methods', async () => {
    const protocol = http({ baseUrl: 'http://localhost:3000' })
    const ctx = await protocol.setup()
    expect(typeof ctx.get).toBe('function')
    expect(typeof ctx.post).toBe('function')
    expect(typeof ctx.put).toBe('function')
    expect(typeof ctx.patch).toBe('function')
    expect(typeof ctx.delete).toBe('function')
  })

  it('strips trailing slash from baseUrl', async () => {
    const protocol = http({ baseUrl: 'http://localhost:3000/' })
    const ctx = await protocol.setup()
    // Verify the context was created (actual HTTP calls tested in integration)
    expect(ctx).toBeDefined()
  })
})
```

**Step 6: Install dependencies**

Run: `npm install`

**Step 7: Run tests**

Run: `npm test -w packages/protocol-http`
Expected: All 3 tests pass.

**Step 8: Build**

Run: `npm run build -w packages/protocol-http`
Expected: Build succeeds.

**Step 9: Commit**

```bash
git add packages/protocol-http/
git commit -m "feat: add @aver/protocol-http package"
```

---

### Task 3: Create example app scaffolding + Express API

**Files:**
- Create: `examples/e-commerce/package.json`
- Create: `examples/e-commerce/tsconfig.json`
- Create: `examples/e-commerce/src/server/board.ts`
- Create: `examples/e-commerce/src/server/routes.ts`
- Create: `examples/e-commerce/src/server/index.ts`

**Step 1: Update root package.json to include examples workspace**

In the root `package.json`, change:
```json
"workspaces": ["packages/*"]
```
To:
```json
"workspaces": ["packages/*", "examples/*"]
```

**Step 2: Create example package.json**

Create `examples/e-commerce/package.json`:
```json
{
  "name": "@aver/example-task-board",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build && tsc -p tsconfig.server.json",
    "server": "tsx src/server/index.ts",
    "test": "vitest run",
    "test:direct": "AVER_ADAPTER=direct vitest run",
    "test:http": "AVER_ADAPTER=http vitest run",
    "test:playwright": "AVER_ADAPTER=playwright vitest run"
  },
  "dependencies": {
    "express": "^5.1.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.5.2",
    "aver": "*",
    "@aver/protocol-http": "*",
    "@aver/protocol-playwright": "*",
    "playwright": "^1.52.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vite": "^6.3.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 3: Create tsconfig.json (for Vite/React)**

Create `examples/e-commerce/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*", "domains/**/*", "adapters/**/*", "tests/**/*"]
}
```

Create `examples/e-commerce/tsconfig.server.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "outDir": "dist/server"
  },
  "include": ["src/server/**/*"]
}
```

**Step 4: Create pure board logic**

Create `examples/e-commerce/src/server/board.ts`:
```typescript
export interface Task {
  id: string
  title: string
  status: string
  assignee?: string
}

export class Board {
  private tasks: Task[] = []
  private nextId = 1

  create(title: string, status = 'backlog'): Task {
    const task: Task = { id: String(this.nextId++), title, status }
    this.tasks.push(task)
    return task
  }

  move(title: string, status: string): Task {
    const task = this.tasks.find(t => t.title === title)
    if (!task) throw new Error(`Task "${title}" not found`)
    task.status = status
    return task
  }

  assign(title: string, assignee: string): Task {
    const task = this.tasks.find(t => t.title === title)
    if (!task) throw new Error(`Task "${title}" not found`)
    task.assignee = assignee
    return task
  }

  byStatus(status: string): Task[] {
    return this.tasks.filter(t => t.status === status)
  }

  details(title: string): Task | undefined {
    return this.tasks.find(t => t.title === title)
  }
}
```

**Step 5: Create Express routes**

Create `examples/e-commerce/src/server/routes.ts`:
```typescript
import { Router } from 'express'
import { Board } from './board.js'

export function createRouter(board: Board): Router {
  const router = Router()

  router.post('/tasks', (req, res) => {
    const { title, status } = req.body
    const task = board.create(title, status)
    res.status(201).json(task)
  })

  router.patch('/tasks/:title', (req, res) => {
    const { title } = req.params
    const { status, assignee } = req.body
    try {
      let task
      if (status !== undefined) task = board.move(title, status)
      if (assignee !== undefined) task = board.assign(title, assignee)
      res.json(task)
    } catch (e: any) {
      res.status(404).json({ error: e.message })
    }
  })

  router.get('/tasks', (req, res) => {
    const status = req.query.status as string
    res.json(board.byStatus(status))
  })

  router.get('/tasks/:title', (req, res) => {
    const task = board.details(req.params.title)
    if (!task) return res.status(404).json({ error: 'Not found' })
    res.json(task)
  })

  return router
}
```

**Step 6: Create Express server entry point**

Create `examples/e-commerce/src/server/index.ts`:
```typescript
import express from 'express'
import { Board } from './board.js'
import { createRouter } from './routes.js'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function createServer(board?: Board) {
  const app = express()
  const b = board ?? new Board()

  app.use(express.json())
  app.use('/api', createRouter(b))

  // Serve built SPA in production / test
  const distPath = resolve(__dirname, '../../dist')
  if (existsSync(distPath)) {
    app.use(express.static(distPath))
    app.get('*', (_req, res) => {
      res.sendFile(resolve(distPath, 'index.html'))
    })
  }

  return { app, board: b }
}

// Start server if run directly
const isDirectRun = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')
if (isDirectRun) {
  const { app } = createServer()
  const port = process.env.PORT ?? 3000
  app.listen(port, () => {
    console.log(`Task board server running on http://localhost:${port}`)
  })
}
```

**Step 7: Commit**

```bash
git add examples/e-commerce/ package.json
git commit -m "feat: add example app scaffolding with Express API"
```

---

### Task 4: Create domain definition + direct adapter

**Files:**
- Create: `examples/e-commerce/domains/task-board.ts`
- Create: `examples/e-commerce/adapters/task-board.direct.ts`

**Step 1: Create the domain**

Create `examples/e-commerce/domains/task-board.ts`:
```typescript
import { defineDomain, action, query, assertion } from 'aver'
import type { Task } from '../src/server/board.js'

export type { Task }

export const taskBoard = defineDomain({
  name: 'task-board',
  actions: {
    createTask: action<{ title: string; status?: string }>(),
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

**Step 2: Create the direct adapter**

Create `examples/e-commerce/adapters/task-board.direct.ts`:
```typescript
import { implement, direct } from 'aver'
import { Board } from '../src/server/board.js'
import { taskBoard } from '../domains/task-board.js'

export const directAdapter = implement(taskBoard, {
  protocol: direct(() => new Board()),

  actions: {
    createTask: async (board, { title, status }) => {
      board.create(title, status)
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

**Step 3: Commit**

```bash
git add examples/e-commerce/domains/ examples/e-commerce/adapters/task-board.direct.ts
git commit -m "feat: add task-board domain and direct adapter"
```

---

### Task 5: Create HTTP adapter

**Files:**
- Create: `examples/e-commerce/adapters/task-board.http.ts`

**Step 1: Create the HTTP adapter**

Create `examples/e-commerce/adapters/task-board.http.ts`:
```typescript
import { implement } from 'aver'
import { http } from '@aver/protocol-http'
import { taskBoard } from '../domains/task-board.js'
import { createServer } from '../src/server/index.js'
import type { Server } from 'node:http'

let server: Server | undefined

const httpProtocol = {
  ...http({ baseUrl: 'http://localhost:0' }),
  name: 'http',
  async setup() {
    const { app } = createServer()
    server = await new Promise<Server>(resolve => {
      const s = app.listen(0, () => resolve(s))
    })
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 3000
    const base = `http://localhost:${port}`

    const ctx = await http({ baseUrl: base }).setup()
    return ctx
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
      if (!res.ok) throw new Error(`Task "${title}" not found`)
      const task = await res.json()
      if (task.status !== status) {
        throw new Error(`Expected task "${title}" in "${status}" but was in "${task.status}"`)
      }
    },
    taskAssignedTo: async (ctx, { title, assignee }) => {
      const res = await ctx.get(`/api/tasks/${encodeURIComponent(title)}`)
      if (!res.ok) throw new Error(`Task "${title}" not found`)
      const task = await res.json()
      if (task.assignee !== assignee) {
        throw new Error(`Expected task "${title}" assigned to "${assignee}" but was "${task.assignee}"`)
      }
    },
    taskCount: async (ctx, { status, count }) => {
      const res = await ctx.get(`/api/tasks?status=${encodeURIComponent(status)}`)
      const tasks = await res.json()
      if (tasks.length !== count) {
        throw new Error(`Expected ${count} tasks in "${status}" but found ${tasks.length}`)
      }
    },
  },
})
```

**Step 2: Commit**

```bash
git add examples/e-commerce/adapters/task-board.http.ts
git commit -m "feat: add HTTP adapter for task board example"
```

---

### Task 6: Create Playwright adapter

**Files:**
- Create: `examples/e-commerce/adapters/task-board.playwright.ts`

**Step 1: Create the Playwright adapter**

This adapter starts the Express server, launches a browser, and drives the React SPA UI. It relies on the SPA being built (`vite build`) and served by Express. The adapter will use test IDs for element selection.

Create `examples/e-commerce/adapters/task-board.playwright.ts`:
```typescript
import { implement } from 'aver'
import { playwright } from '@aver/protocol-playwright'
import { taskBoard } from '../domains/task-board.js'
import { createServer } from '../src/server/index.js'
import type { Server } from 'node:http'
import type { Page } from 'playwright'

let server: Server | undefined
let baseUrl: string

const playwrightProtocol = {
  ...playwright({ headless: true }),
  name: 'playwright',
  async setup(): Promise<Page> {
    // Start Express server
    const { app } = createServer()
    server = await new Promise<Server>(resolve => {
      const s = app.listen(0, () => resolve(s))
    })
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 3000
    baseUrl = `http://localhost:${port}`

    // Launch browser via parent protocol
    const page = await playwright({ headless: true }).setup()
    await page.goto(baseUrl)
    return page
  },
  async teardown(page: Page) {
    await page.context().browser()?.close()
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
      server = undefined
    }
  },
}

export const playwrightAdapter = implement(taskBoard, {
  protocol: playwrightProtocol,

  actions: {
    createTask: async (page, { title, status }) => {
      await page.getByTestId('new-task-title').fill(title)
      if (status && status !== 'backlog') {
        await page.getByTestId('new-task-status').selectOption(status)
      }
      await page.getByTestId('create-task-btn').click()
      await page.getByTestId(`task-${title}`).waitFor()
    },
    moveTask: async (page, { title, status }) => {
      await page.getByTestId(`task-${title}`).getByTestId(`move-${status}`).click()
      await page.getByTestId(`column-${status}`).getByTestId(`task-${title}`).waitFor()
    },
    assignTask: async (page, { title, assignee }) => {
      await page.getByTestId(`task-${title}`).getByTestId('assign-input').fill(assignee)
      await page.getByTestId(`task-${title}`).getByTestId('assign-btn').click()
      await page.getByTestId(`task-${title}`).getByText(assignee).waitFor()
    },
  },

  queries: {
    tasksByStatus: async (page, { status }) => {
      const column = page.getByTestId(`column-${status}`)
      const cards = column.getByTestId(/^task-/)
      const count = await cards.count()
      const tasks = []
      for (let i = 0; i < count; i++) {
        const card = cards.nth(i)
        const taskTitle = await card.getByTestId('task-title').textContent() ?? ''
        const assigneeEl = card.getByTestId('task-assignee')
        const assignee = (await assigneeEl.count()) > 0 ? await assigneeEl.textContent() : undefined
        tasks.push({ title: taskTitle.trim(), status, assignee: assignee?.trim() || undefined })
      }
      return tasks
    },
    taskDetails: async (page, { title }) => {
      const card = page.getByTestId(`task-${title}`)
      if ((await card.count()) === 0) return undefined
      const status = await card.getAttribute('data-status') ?? ''
      const assigneeEl = card.getByTestId('task-assignee')
      const assignee = (await assigneeEl.count()) > 0 ? await assigneeEl.textContent() : undefined
      return { title, status, assignee: assignee?.trim() || undefined }
    },
  },

  assertions: {
    taskInStatus: async (page, { title, status }) => {
      const card = page.getByTestId(`column-${status}`).getByTestId(`task-${title}`)
      const count = await card.count()
      if (count === 0) {
        throw new Error(`Expected task "${title}" in column "${status}" but not found`)
      }
    },
    taskAssignedTo: async (page, { title, assignee }) => {
      const text = await page.getByTestId(`task-${title}`).getByTestId('task-assignee').textContent()
      if (text?.trim() !== assignee) {
        throw new Error(`Expected task "${title}" assigned to "${assignee}" but was "${text?.trim()}"`)
      }
    },
    taskCount: async (page, { status, count }) => {
      const column = page.getByTestId(`column-${status}`)
      const cards = column.getByTestId(/^task-/)
      const actual = await cards.count()
      if (actual !== count) {
        throw new Error(`Expected ${count} tasks in "${status}" but found ${actual}`)
      }
    },
  },
})
```

**Step 2: Commit**

```bash
git add examples/e-commerce/adapters/task-board.playwright.ts
git commit -m "feat: add Playwright adapter for task board example"
```

---

### Task 7: Create React SPA

**Files:**
- Create: `examples/e-commerce/index.html`
- Create: `examples/e-commerce/vite.config.ts`
- Create: `examples/e-commerce/src/app/main.tsx`
- Create: `examples/e-commerce/src/app/App.tsx`
- Create: `examples/e-commerce/src/app/App.css`

The SPA is a single-page kanban board with three columns. It uses `data-testid` attributes for Playwright selection. Minimal styling — functional, not pretty.

**Step 1: Create vite.config.ts**

Create `examples/e-commerce/vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
```

**Step 2: Create index.html**

Create `examples/e-commerce/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Task Board — Aver Example</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/app/main.tsx"></script>
</body>
</html>
```

**Step 3: Create main.tsx**

Create `examples/e-commerce/src/app/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import './App.css'

createRoot(document.getElementById('root')!).render(<App />)
```

**Step 4: Create App.tsx**

Create `examples/e-commerce/src/app/App.tsx`:
```tsx
import { useState, useEffect, useCallback } from 'react'

interface Task {
  id: string
  title: string
  status: string
  assignee?: string
}

const COLUMNS = ['backlog', 'in-progress', 'done']

export function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [newStatus, setNewStatus] = useState('backlog')

  const refresh = useCallback(async () => {
    const all: Task[] = []
    for (const status of COLUMNS) {
      const res = await fetch(`/api/tasks?status=${encodeURIComponent(status)}`)
      const items = await res.json()
      all.push(...items)
    }
    setTasks(all)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, status: newStatus }),
    })
    setNewTitle('')
    setNewStatus('backlog')
    await refresh()
  }

  const handleMove = async (title: string, status: string) => {
    await fetch(`/api/tasks/${encodeURIComponent(title)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await refresh()
  }

  const handleAssign = async (title: string, assignee: string) => {
    await fetch(`/api/tasks/${encodeURIComponent(title)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignee }),
    })
    await refresh()
  }

  return (
    <div className="board">
      <h1>Task Board</h1>

      <form onSubmit={handleCreate} className="create-form">
        <input
          data-testid="new-task-title"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder="Task title"
        />
        <select
          data-testid="new-task-status"
          value={newStatus}
          onChange={e => setNewStatus(e.target.value)}
        >
          {COLUMNS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button data-testid="create-task-btn" type="submit">Create</button>
      </form>

      <div className="columns">
        {COLUMNS.map(col => (
          <div key={col} className="column" data-testid={`column-${col}`}>
            <h2>{col}</h2>
            {tasks.filter(t => t.status === col).map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onMove={handleMove}
                onAssign={handleAssign}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function TaskCard({
  task,
  onMove,
  onAssign,
}: {
  task: Task
  onMove: (title: string, status: string) => void
  onAssign: (title: string, assignee: string) => void
}) {
  const [assignInput, setAssignInput] = useState('')

  return (
    <div className="card" data-testid={`task-${task.title}`} data-status={task.status}>
      <div data-testid="task-title">{task.title}</div>
      {task.assignee && <div data-testid="task-assignee">{task.assignee}</div>}

      <div className="actions">
        {COLUMNS.filter(c => c !== task.status).map(c => (
          <button key={c} data-testid={`move-${c}`} onClick={() => onMove(task.title, c)}>
            → {c}
          </button>
        ))}
      </div>

      <div className="assign">
        <input
          data-testid="assign-input"
          value={assignInput}
          onChange={e => setAssignInput(e.target.value)}
          placeholder="Assignee"
          size={10}
        />
        <button
          data-testid="assign-btn"
          onClick={() => { onAssign(task.title, assignInput); setAssignInput('') }}
        >
          Assign
        </button>
      </div>
    </div>
  )
}
```

**Step 5: Create App.css**

Create `examples/e-commerce/src/app/App.css`:
```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; background: #f5f5f5; padding: 1rem; }
h1 { margin-bottom: 1rem; }
.create-form { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
.create-form input { padding: 0.4rem; flex: 1; }
.create-form select, .create-form button { padding: 0.4rem 0.8rem; }
.columns { display: flex; gap: 1rem; }
.column { flex: 1; background: #e8e8e8; border-radius: 6px; padding: 0.75rem; min-height: 200px; }
.column h2 { font-size: 0.9rem; text-transform: uppercase; color: #666; margin-bottom: 0.75rem; }
.card { background: white; border-radius: 4px; padding: 0.6rem; margin-bottom: 0.5rem; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
.card [data-testid="task-title"] { font-weight: 600; margin-bottom: 0.3rem; }
.card [data-testid="task-assignee"] { font-size: 0.85rem; color: #666; margin-bottom: 0.3rem; }
.actions { display: flex; gap: 0.3rem; margin-top: 0.4rem; flex-wrap: wrap; }
.actions button { font-size: 0.75rem; padding: 0.2rem 0.4rem; cursor: pointer; }
.assign { display: flex; gap: 0.3rem; margin-top: 0.3rem; }
.assign input { font-size: 0.8rem; padding: 0.2rem; }
.assign button { font-size: 0.75rem; padding: 0.2rem 0.4rem; cursor: pointer; }
```

**Step 6: Commit**

```bash
git add examples/e-commerce/index.html examples/e-commerce/vite.config.ts examples/e-commerce/src/app/
git commit -m "feat: add React SPA for task board example"
```

---

### Task 8: Create test file + aver.config.ts, run tests

**Files:**
- Create: `examples/e-commerce/aver.config.ts`
- Create: `examples/e-commerce/tests/task-board.spec.ts`

**Step 1: Create aver.config.ts**

Create `examples/e-commerce/aver.config.ts`:
```typescript
import { defineConfig } from 'aver'
import { directAdapter } from './adapters/task-board.direct.js'
import { httpAdapter } from './adapters/task-board.http.js'
import { playwrightAdapter } from './adapters/task-board.playwright.js'

export default defineConfig({
  adapters: [directAdapter, httpAdapter, playwrightAdapter],
})
```

**Step 2: Create the test file**

Create `examples/e-commerce/tests/task-board.spec.ts`:
```typescript
import { expect } from 'vitest'
import { suite } from 'aver'
import { taskBoard } from '../domains/task-board.js'

// Import config to auto-register all adapters
import '../aver.config.js'

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
  expect(task?.status).toBe('in-progress')
  expect(task?.assignee).toBe('Alice')
})
```

**Step 3: Install dependencies**

Run: `npm install`

**Step 4: Build the SPA (needed for playwright and http adapters)**

Run: `cd examples/e-commerce && npx vite build`

**Step 5: Install Playwright browsers**

Run: `cd examples/e-commerce && npx playwright install chromium`

**Step 6: Run tests with direct adapter only first**

Run: `cd examples/e-commerce && AVER_ADAPTER=direct npx vitest run`
Expected: 4 tests pass with `[direct]` suffix.

**Step 7: Run tests with http adapter**

Run: `cd examples/e-commerce && AVER_ADAPTER=http npx vitest run`
Expected: 4 tests pass with `[http]` suffix.

**Step 8: Run tests with playwright adapter**

Run: `cd examples/e-commerce && AVER_ADAPTER=playwright npx vitest run`
Expected: 4 tests pass with `[playwright]` suffix.

**Step 9: Run all adapters together**

Run: `cd examples/e-commerce && npx vitest run`
Expected: 12 tests pass (4 tests × 3 adapters).

**Step 10: Commit**

```bash
git add examples/e-commerce/aver.config.ts examples/e-commerce/tests/
git commit -m "feat: add task board tests — same tests, three adapters"
```

---

### Task 9: Final verification

**Step 1: Run all tests across entire monorepo**

Run: `npm test --workspaces`
Expected: All tests pass (50 aver + 37 mcp-server + 2 protocol-playwright + 3 protocol-http + 12 example = 104 total).

**Step 2: Verify TypeScript**

Run: `npx tsc --noEmit -p packages/aver/tsconfig.json`
Expected: No errors.

**Step 3: Verify all builds**

Run: `npm run build -w packages/aver && npm run build -w packages/protocol-http`
Expected: Both build successfully.
