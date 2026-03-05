# Aver

[![CI](https://github.com/njackson/aver/actions/workflows/ci.yml/badge.svg)](https://github.com/njackson/aver/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@aver/core)](https://www.npmjs.com/package/@aver/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Domain-driven acceptance testing for TypeScript.

## The Problem

You have code you need to change but can't test safely. The behavior is implicit — buried in tangled functions, framework callbacks, and undocumented side effects. Writing tests after the fact couples them to the current implementation, so they break the moment you refactor.

## Lock In What Exists

Start with approval testing. Call a function, capture its output, and lock in the current behavior as a baseline:

```typescript
import { approve } from '@aver/approvals'

test('order summary matches baseline', async () => {
  const result = await generateOrderSummary(sampleOrder)
  await approve(result)
})
```

The first run saves the output. Every subsequent run compares against it. If the behavior changes, the test fails with a diff. Now you have a safety net.

## Extract the Domain

Once you have characterization coverage, name the behaviors. A domain is a vocabulary of actions, queries, and assertions — what your system does, independent of how it does it:

```typescript
import { defineDomain, action, query, assertion } from '@aver/core'

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

Actions change state. Queries read state. Assertions verify state. The domain says nothing about classes, endpoints, or selectors — only what the system does in business terms.

## Adapters as Interaction Modes

Your system has different interaction modes: direct function calls, an HTTP API, a browser UI. Each adapter binds the same domain vocabulary to a different protocol:

```typescript
import { implement, unit } from '@aver/core'

export const directAdapter = implement(taskBoard, {
  protocol: unit(() => new Board()),
  actions: {
    createTask: async (board, { title }) => board.create(title),
    moveTask: async (board, { title, status }) => board.move(title, status),
  },
  queries: {
    taskDetails: async (board, { title }) => board.getTask(title),
  },
  assertions: {
    taskInStatus: async (board, { title, status }) => {
      const task = board.getTask(title)
      expect(task.status).toBe(status)
    },
  },
})
```

Tests use domain language — no implementation details leak through:

```typescript
import { suite } from '@aver/core'
import { taskBoard } from '../domains/task-board'

const { test } = suite(taskBoard)

test('move task through workflow', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix login bug' })
  await act.moveTask({ title: 'Fix login bug', status: 'in-progress' })
  await assert.taskInStatus({ title: 'Fix login bug', status: 'in-progress' })
})
```

Register multiple adapters and the same tests run against all of them:

```
 ✓ move task through workflow [unit]          1ms
 ✓ move task through workflow [http]         12ms
 ✓ move task through workflow [playwright]  280ms
```

The domain vocabulary stays the same. Adapters are interchangeable. Some scenarios test one adapter, some test several. The framework keeps domain language separate — tests compose vocabulary with adapters via the suite.

## Quick Start

```bash
npm install @aver/core
npx aver init --domain ShoppingCart --protocol unit
npx aver run
```

See the [Getting Started guide](docs/guides/getting-started.md) for a complete walkthrough.

## Packages

### Core (Stable)

| Package | Description |
|---------|-------------|
| [`@aver/core`](packages/core) | Core framework — domains, adapters, suite, CLI |
| [`@aver/approvals`](packages/approvals) | Approval testing — structural diffs and visual screenshot comparison |
| [`@aver/protocol-http`](packages/protocol-http) | HTTP protocol adapter (fetch-based) |
| [`@aver/protocol-playwright`](packages/protocol-playwright) | Playwright browser protocol adapter |

### AI-Assisted (Experimental)

| Package | Description |
|---------|-------------|
| [`@aver/agent-plugin`](packages/agent-plugin) | Claude Code plugin — MCP server + maturity pipeline workflow skill |
| [`@aver/mcp-server`](packages/mcp-server) | MCP server for AI-assisted testing |
| [`@aver/workspace`](packages/workspace) | Scenario workspace engine — storage, operations, and backlog |

## Key Concepts

- **Domain** — a named vocabulary of actions, queries, and assertions that describe what your system does
- **Adapter** — binds a domain to a real implementation via a protocol (unit, HTTP, Playwright, etc.)
- **Protocol** — manages session lifecycle (setup/teardown) and provides context to handlers
- **Suite** — connects a domain to its adapters and runs tests, with automatic multi-adapter support

## License

[MIT](LICENSE)
