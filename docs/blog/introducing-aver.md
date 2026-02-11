---
layout: default
title: "Introducing Aver: Domain-Driven Acceptance Testing for TypeScript"
nav_order: 10
---

# Introducing Aver

*February 2026*

AI writes code faster than we can verify it. That's the uncomfortable truth of modern development: your copilot can scaffold an entire feature in minutes, but the test suite — the thing that tells you whether the feature actually works — is still stuck in 2015.

Here's the pattern I kept seeing: an AI agent refactors a component, and half the Playwright tests break. Not because the feature is broken. Because the tests were testing *implementation*, not *behavior*. A button moved from a sidebar to a header. A CSS class got renamed. The REST endpoint changed from `/api/tasks` to `/api/v2/tasks`. Every one of those changes is invisible to users but catastrophic to implementation-coupled tests.

I built Aver to fix this.

## The Problem: Tests That Test the Wrong Thing

Consider a typical Playwright test for a task board:

```typescript
test('move task to in-progress', async ({ page }) => {
  await page.goto('http://localhost:3000')
  await page.getByTestId('new-task-title').fill('Fix login bug')
  await page.getByTestId('create-task-btn').click()
  await page.getByTestId('task-Fix login bug').waitFor()
  await page.getByTestId('task-Fix login bug')
    .getByTestId('move-in-progress').click()
  await page.getByTestId('column-in-progress')
    .getByTestId('task-Fix login bug').waitFor()
})
```

This test knows *everything* about the implementation: test IDs, CSS selectors, page URLs, the DOM structure of columns and cards. It's a contract with the UI, not a verification of business logic. When an AI agent redesigns the board layout, this test breaks — even if the "move task" feature works perfectly.

Now multiply that by fifty tests and three developers using AI coding tools daily. You spend more time fixing tests than shipping features.

## What If the Test Never Mentioned Implementation?

Here's the same test in Aver:

```typescript
test('move task to in-progress', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix login bug' })
  await act.moveTask({ title: 'Fix login bug', status: 'in-progress' })
  await assert.taskInStatus({ title: 'Fix login bug', status: 'in-progress' })
})
```

No selectors. No URLs. No page objects. Just domain language: *create a task, move it, verify it moved.*

This test doesn't know whether it's running against a React UI, an Express API, or an in-memory object. The business intent is the entire test. And when an AI agent refactors the UI, the API, or the internal data model — this test doesn't change.

## How Aver Works

Aver separates *what to test* from *how to test* using three layers:

```
Domain (what)  -->  Adapter (how)  -->  Test (verify)
```

### Layer 1: Define the Domain

A domain declares your testing vocabulary in business language — the actions your system performs, the queries it answers, and the assertions you verify:

```typescript
import { defineDomain, action, query, assertion } from 'aver'

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

This is the stable center of your test suite. It changes only when business requirements change — never because someone renamed a CSS class or restructured an API endpoint.

### Layer 2: Implement Adapters

An adapter binds domain vocabulary to a real system. Here's the unit adapter for the task board — it tests directly against the `Board` class:

```typescript
import { implement, unit } from 'aver'

export const unitAdapter = implement(taskBoard, {
  protocol: unit(() => new Board()),
  actions: {
    createTask: async (board, { title, status }) => board.create(title, status),
    deleteTask: async (board, { title }) => board.delete(title),
    moveTask: async (board, { title, status }) => board.move(title, status),
    assignTask: async (board, { title, assignee }) => board.assign(title, assignee),
  },
  queries: {
    tasksByStatus: async (board, { status }) => board.byStatus(status),
    taskDetails: async (board, { title }) => board.details(title),
  },
  assertions: {
    taskInStatus: async (board, { title, status }) => {
      const task = board.details(title)
      if (task?.status !== status)
        throw new Error(`Expected "${title}" in "${status}" but was "${task?.status}"`)
    },
    // ... remaining assertions
  },
})
```

The `implement()` function is fully typed — TypeScript enforces that every action, query, and assertion from the domain has a corresponding handler. Miss one and you get a compile error, not a runtime surprise.

### Layer 3: Write Tests

Tests import the domain, not the adapter. They speak only domain language:

```typescript
import { suite } from 'aver'
import { taskBoard } from '../domains/task-board'
// Config is loaded via vitest setupFiles (see vitest.config.ts)

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
  expect(task?.status).toBe('in-progress')
  expect(task?.assignee).toBe('Alice')
})
```

The `{ act, query, assert }` callback provides typed proxy objects — one for each vocabulary category. TypeScript autocomplete works through the entire chain, from domain definition to test assertion.

## Same Test, Three Adapters

Here's where it gets interesting. The task board example has three adapters:

- **unit** — tests the `Board` class directly (sub-millisecond)
- **http** — tests the Express API via fetch
- **playwright** — tests the React UI in a real browser

All three are registered in a single config:

```typescript
// aver.config.ts
import { defineConfig } from 'aver'
import { unitAdapter } from './adapters/task-board.unit'
import { httpAdapter } from './adapters/task-board.http'
import { playwrightAdapter } from './adapters/task-board.playwright'

export default defineConfig({
  adapters: [unitAdapter, httpAdapter, playwrightAdapter],
})
```

Run the tests:

```
$ npx vitest run

 ✓ create a task in backlog [unit]            1ms
 ✓ create a task in backlog [http]           55ms
 ✓ create a task in backlog [playwright]   1890ms
 ✓ move task through workflow [unit]          1ms
 ✓ move task through workflow [http]         11ms
 ✓ move task through workflow [playwright]  369ms
 ✓ delete a task [unit]                       0ms
 ✓ delete a task [http]                       7ms
 ✓ delete a task [playwright]               325ms
 ✓ track full task lifecycle [unit]           1ms
 ✓ track full task lifecycle [http]           9ms
 ✓ track full task lifecycle [playwright]   408ms

 Tests  15 passed (15)
```

Five tests. Three adapters. Fifteen runs. Zero code duplication.

The unit adapter validates your business logic in under 5ms. The HTTP adapter verifies your API contracts. The Playwright adapter confirms the UI works end-to-end. And the test code is *identical* for all three.

This is the moment it clicked for me: writing the test once and running it at every level of the stack isn't just a nice-to-have. It's the only sane way to test when AI is refactoring your code daily.

## Adding a Feature: The Domain-First Workflow

To show what development actually feels like with Aver, I recently added a "delete task" feature to the example app. Here's exactly how it went:

**Step 1: Add the vocabulary.** One line in the domain definition:

```typescript
deleteTask: action<{ title: string }>(),
```

**Step 2: TypeScript tells you what's broken.** Immediately, the compiler flags every adapter:

```
adapters/task-board.unit.ts: Property 'deleteTask' is missing
adapters/task-board.http.ts: Property 'deleteTask' is missing
adapters/task-board.playwright.ts: Property 'deleteTask' is missing
```

This is the power of the phantom type system. You can't forget an adapter — the compiler won't let you.

**Step 3: Write the test.** Before touching any implementation:

```typescript
test('delete a task', async ({ act, assert }) => {
  await act.createTask({ title: 'Stale task' })
  await assert.taskCount({ status: 'backlog', count: 1 })
  await act.deleteTask({ title: 'Stale task' })
  await assert.taskCount({ status: 'backlog', count: 0 })
})
```

**Step 4: Make it pass.** Implement `deleteTask` in each adapter — the unit adapter calls `board.delete(title)`, the HTTP adapter sends `DELETE /api/tasks/:title`, the Playwright adapter clicks the delete button and waits for the card to disappear.

**Step 5: Run the tests.** All 15 pass. Feature done.

The critical thing: the *test* was the first artifact. It describes the business intent — "deleting a task removes it" — before any implementation exists. When an AI agent inevitably refactors the React components or the Express routes, this test won't change.

## When Tests Fail: Action Traces

When something goes wrong, Aver shows you the action trace — every domain operation leading to the failure:

```
FAIL  task-board.spec.ts > track full task lifecycle [http]

Action trace:
  [PASS] task-board.createTask({"title":"Fix login bug"})
  [PASS] task-board.assignTask({"title":"Fix login bug","assignee":"Alice"})
  [FAIL] task-board.moveTask({"title":"Fix login bug","status":"in-progress"})
         — Failed to move task: 404

  Failed to move task: 404
```

The trace is in domain language. You see what the test *intended* to do and where it broke, without reading Playwright selectors or HTTP request logs. An AI agent can read this trace and understand the failure without context about the implementation.

## AI-Native Testing via MCP

Aver ships a Claude Code plugin (`@aver/claude-code-plugin`) that bundles an MCP server and a workflow skill. Install it and your AI assistant gets ten tools for exploring domains, running tests, and scaffolding code — plus a skill that teaches the domain-first workflow with code examples.

This isn't theoretical — I used it to build the `deleteTask` feature you just read about.

```bash
claude plugin add @aver/claude-code-plugin
```

Or configure the MCP server directly in `.mcp.json`:

```json
{
  "mcpServers": {
    "aver": {
      "command": "npx",
      "args": ["aver-mcp"]
    }
  }
}
```

Here's what the AI-assisted workflow actually looks like.

**Step 1: Explore the domain.** The AI calls `list_domains`:

```json
[
  {
    "name": "task-board",
    "actions": ["createTask", "moveTask", "assignTask"],
    "queries": ["tasksByStatus", "taskDetails"],
    "assertions": ["taskInStatus", "taskAssignedTo", "taskCount"],
    "actionCount": 3,
    "queryCount": 2,
    "assertionCount": 3
  }
]
```

Three actions, two queries, three assertions. The AI now understands the testing vocabulary — without reading a single source file.

**Step 2: Locate source files.** The AI calls `get_project_context` to discover where everything lives:

```json
{
  "configPath": "aver.config.ts",
  "domains": [{
    "name": "task-board",
    "domainFile": "domains/task-board.ts",
    "testFile": "tests/task-board.spec.ts",
    "adapters": [
      { "protocol": "unit", "file": "adapters/task-board.unit.ts" },
      { "protocol": "http", "file": "adapters/task-board.http.ts" },
      { "protocol": "playwright", "file": "adapters/task-board.playwright.ts" }
    ]
  }]
}
```

This is important because Aver uses phantom types for compile-time enforcement — `action<{ title: string }>()` produces just `{ kind: 'action' }` at runtime. The MCP server can tell the AI *where* to look, but the AI needs to read the actual TypeScript source to see the type signatures.

**Step 3: Define, test, implement.** The AI adds `deleteTask` to the domain, writes a test, then implements the handler in each adapter. TypeScript flags every adapter that's missing the new handler — the compiler enforces completeness.

**Step 4: Verify.** The AI calls `run_tests`, then `get_run_diff` to see what changed:

```json
{
  "newlyPassing": [
    "delete a task [unit]",
    "delete a task [http]",
    "delete a task [playwright]"
  ],
  "newlyFailing": [],
  "stillFailing": []
}
```

Three new tests, all passing, nothing broken. Feature done.

The key insight: the AI never needs to read your Playwright selectors, parse your Express routes, or understand your React component tree. It interacts with your system through the domain vocabulary — the same stable contract your tests use. The plugin's workflow skill teaches this pattern, so every AI interaction follows the domain-first approach.

## Standing on Shoulders

Aver didn't emerge from nothing. It's a synthesis of ideas I've admired for years:

**Dave Farley's acceptance test architecture.** In *Continuous Delivery* (2010) and his later talks, Farley describes a four-layer model that separates test intent from implementation through a "domain-specific language" layer and a "protocol driver" layer. Aver's three-layer model — domain, adapter, test — is a direct simplification of this architecture, with TypeScript's type system replacing the ceremony of Java-era patterns.

**The Screenplay pattern and Serenity.js.** The Screenplay pattern (Antony Marcano, Andy Palmer, Jan Molak) decomposed test automation into actors, tasks, questions, and abilities — separating *what* from *how* at the test level. Serenity.js brought this to JavaScript with strong reporting. Aver takes the same conceptual split (actions, queries, assertions) but optimizes for TypeScript ergonomics: no class hierarchies, no decorator chains, just typed functions and phantom types.

**Spec-Driven Development.** The ThoughtWorks Technology Radar now tracks "specification-driven development" as a technique worth adopting. Tools like GitHub Spec Kit and AWS Kiro focus on generating code from specs. Aver comes at it from the other side: the specification *is* the test, expressed in domain language. When the domain definition is the single source of truth, AI agents can generate adapters, propose tests, and verify behavior — all through a stable contract.

## What Aver Is (and Isn't)

Aver is a testing framework. It runs on Vitest (or any test runner with a compatible API). It doesn't generate code, manage infrastructure, or replace your CI pipeline.

What it does:

- **Separates intent from implementation** in your test suite
- **Eliminates test duplication** across unit, API, and browser levels
- **Gives AI agents a stable interface** for understanding and verifying your system
- **Catches incomplete implementations** at compile time via TypeScript's type system
- **Produces domain-language traces** that humans and AI can both read

The name "aver" means "to declare with confidence." Your tests aver that the system behaves as intended — regardless of whether you're testing through a browser, an API, or a function call.

## Try It

```bash
npm install aver
npx aver init --domain TaskBoard --protocol unit
npx vitest run
```

Or explore the [task board example](https://github.com/njackson/aver/tree/main/examples/task-board) — a React + Express app tested across all three adapters.

- [Documentation](/)
- [Getting Started](/getting-started)
- [Architecture](/architecture)
- [GitHub](https://github.com/njackson/aver)

---

*Aver is MIT-licensed and open source. Built by [Nate Jackson](https://github.com/njackson).*
