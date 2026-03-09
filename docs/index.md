---
layout: default
title: Home
nav_order: 1
---

# Aver

Domain-driven acceptance testing for TypeScript.
{: .fs-6 .fw-300 }

[Tutorial](tutorial){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[GitHub](https://github.com/njackson/aver){: .btn .fs-5 .mb-4 .mb-md-0 }

---

## Define once, verify everywhere

Write tests in domain language. Run them against any adapter — in-memory, HTTP, browser.

```typescript
const { test } = suite(taskBoard)

test('move task through workflow', async ({ given, when, then }) => {
  await given.createTask({ title: 'Fix login bug' })
  await when.moveTask({ title: 'Fix login bug', status: 'in-progress' })
  await then.taskInStatus({ title: 'Fix login bug', status: 'in-progress' })
})
```

```
 ✓ move task through workflow [unit]          1ms
 ✓ move task through workflow [http]         12ms
 ✓ move task through workflow [playwright]  280ms
```

Same test. Three adapters. Zero code duplication.

---

## Why this matters

Every project of sufficient complexity builds a domain language for its tests. Page objects, test data factories, service layer abstractions, custom assertion helpers — every team arrives at some subset of this infrastructure, builds it from scratch, and rebuilds it on the next project.

The testing pyramid tells you to write tests at multiple levels. What it doesn't tell you is how to stop duplicating behavioral intent across those levels. "Creating a task puts it in backlog" is the same requirement whether you're verifying it against a class, an API, or a browser. Three tests, one requirement, three places to update when the requirement changes.

Aver gives you the missing spine: a shared domain vocabulary that runs at every level through adapters. You still write unit tests for TDD design feedback. You still write level-specific tests for concerns unique to each layer. But the core behavioral contract gets described once and verified everywhere.

### The three layers

```
Domain (what)  →  Adapter (how)  →  Test (verify)
```

**Domains** declare vocabulary — actions, queries, and assertions in business language. **Adapters** bind that vocabulary to real systems. **Tests** speak only domain language and run against any adapter.

### Legacy code: start from the outside in

Legacy systems have it worst — the test pyramid is inverted, with most coverage at the end-to-end level because the code wasn't designed for unit testing. The usual advice is to add unit tests, but that requires refactoring production code, which requires tests you don't have.

Aver breaks the cycle. Start with `approve()` to lock in current behavior. Extract a domain vocabulary as understanding deepens. Write an E2E adapter first — that's the only handle you have into a tightly coupled system. As you refactor and create clean internal boundaries, add adapters at each new seam. The pyramid grows *inward*, from E2E toward unit, instead of the usual advice of building from unit outward.

First you lock in what the system does. Then you name what it *should* do. The tools are different; the impulse is the same.

### Economics

Five domain operations can support fifty tests that compose them in different ways. Vocabulary grows with *domain surface area* (slowly). Tests grow with *scenarios* (fast). The adapter investment is amortized across every scenario.

With a single adapter, Aver's overhead matches well-structured page objects — you'd extract those anyway. The cross-adapter benefit kicks in at the second adapter: when two adapters disagree on a behavior, that disagreement surfaces a real bug.

---

## Quick start

```bash
npm install --save-dev @aver/core vitest
npx aver init --domain TaskBoard --protocol unit
npx aver run
```

Or follow the [tutorial](tutorial) for a hands-on walkthrough.

---

## Packages

| Package | Description |
|:--------|:------------|
| [`@aver/core`](https://github.com/njackson/aver/tree/main/packages/core) | Domains, adapters, suite, CLI. Zero runtime dependencies. |
| [`@aver/approvals`](https://github.com/njackson/aver/tree/main/packages/approvals) | Approval testing — structural diffs and visual screenshots |
| [`@aver/protocol-http`](https://github.com/njackson/aver/tree/main/packages/protocol-http) | HTTP protocol adapter (fetch-based) |
| [`@aver/protocol-playwright`](https://github.com/njackson/aver/tree/main/packages/protocol-playwright) | Playwright browser protocol adapter |

### AI-assisted testing

| Package | Description |
|:--------|:------------|
| [`@aver/agent-plugin`](https://github.com/njackson/aver/tree/main/packages/agent-plugin) | Claude Code plugin — MCP server + workflow and telemetry skills |
| [`@aver/mcp-server`](https://github.com/njackson/aver/tree/main/packages/mcp-server) | MCP server for AI-assisted scenario management |
| [`@aver/workspace`](https://github.com/njackson/aver/tree/main/packages/workspace) | Scenario workspace — storage, operations, backlog |
