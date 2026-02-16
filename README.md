# Aver

Domain-driven acceptance testing for TypeScript.

Define **what** to test in domain language. Swap **how** via adapters. Same test runs against in-memory objects, HTTP APIs, and browser UI — zero code duplication.

## The Problem

Implementation-coupled tests break when code changes. A Playwright test that clicks specific buttons breaks when the UI changes. A unit test that calls specific methods breaks when the internals are refactored. The business intent — what you're actually verifying — gets buried in implementation details.

## How Aver Works

```
Domain (what)  →  Adapter (how)  →  Test (verify)
```

**1. Define a domain** — your testing vocabulary:

```typescript
import { defineDomain, action, query, assertion } from 'aver'

export const taskBoard = defineDomain({
  name: 'task-board',
  actions: {
    createTask: action<{ title: string }>(),
    moveTask: action<{ title: string; status: string }>(),
  },
  queries: {
    taskDetails: query<{ title: string }, Task>(),
  },
  assertions: {
    taskInStatus: assertion<{ title: string; status: string }>(),
  },
})
```

**2. Write tests** — in domain language, no implementation details:

```typescript
import { suite } from 'aver'
import { taskBoard } from '../domains/task-board'

const { test } = suite(taskBoard)

test('move task through workflow', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix login bug' })
  await act.moveTask({ title: 'Fix login bug', status: 'in-progress' })
  await assert.taskInStatus({ title: 'Fix login bug', status: 'in-progress' })
})
```

**3. Implement adapters** — bind domain vocabulary to real systems:

```typescript
import { implement, unit } from 'aver'

export const directAdapter = implement(taskBoard, {
  protocol: unit(() => new Board()),
  actions: {
    createTask: async (board, { title }) => board.create(title),
    moveTask: async (board, { title, status }) => board.move(title, status),
  },
  // ...
})
```

**One test, multiple adapters.** Register a `unit` adapter, an `http` adapter, and a `playwright` adapter. Aver runs your tests against all of them:

```
 ✓ move task through workflow [unit]          1ms
 ✓ move task through workflow [http]         12ms
 ✓ move task through workflow [playwright]  280ms
```

## Quick Start

```bash
npm install aver
npx aver init --domain ShoppingCart --protocol unit
npx vitest run
```

## Packages

| Package | Description |
|---------|-------------|
| [`aver`](packages/aver) | Core framework — domains, adapters, suite, CLI |
| [`@aver/protocol-http`](packages/protocol-http) | HTTP protocol adapter (fetch-based) |
| [`@aver/protocol-playwright`](packages/protocol-playwright) | Playwright browser protocol adapter |
| [`@aver/mcp-server`](packages/mcp-server) | MCP server for AI-assisted testing |
| [`@aver/agent-plugin`](packages/agent-plugin) | Agent plugin — MCP server + maturity pipeline workflow skill |

## Key Concepts

- **Domain** — a named vocabulary of actions, queries, and assertions that describe what your system does
- **Adapter** — binds a domain to a real implementation via a protocol (unit, HTTP, Playwright, etc.)
- **Protocol** — manages session lifecycle (setup/teardown) and provides context to handlers
- **Suite** — connects a domain to its adapters and runs tests, with automatic multi-adapter support

## License

[MIT](LICENSE)
