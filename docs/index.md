---
layout: default
title: Home
nav_order: 1
---

# Aver

Domain-driven acceptance testing for TypeScript.
{: .fs-6 .fw-300 }

Define **what** to test in domain language. Swap **how** via adapters. Same test runs against in-memory objects, HTTP APIs, and browser UI — zero code duplication.

[Get Started](getting-started){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[View on GitHub](https://github.com/njackson/aver){: .btn .fs-5 .mb-4 .mb-md-0 }

---

## The Problem

Implementation-coupled tests break when code changes. A Playwright test that clicks specific buttons breaks when the UI changes. A unit test that calls specific methods breaks when the internals are refactored. The business intent — what you're actually verifying — gets buried in implementation details.

## How Aver Works

```
Domain (what)  →  Adapter (how)  →  Test (verify)
```

**Domains** declare your testing vocabulary — actions, queries, and assertions in business language. **Adapters** bind that vocabulary to real systems (in-memory, HTTP, browser). **Tests** speak only domain language and run against any adapter.

```typescript
const { test } = suite(taskBoard)

test('move task through workflow', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix login bug' })
  await act.moveTask({ title: 'Fix login bug', status: 'in-progress' })
  await assert.taskInStatus({ title: 'Fix login bug', status: 'in-progress' })
})
```

This test runs identically against a unit adapter (1ms), an HTTP adapter (12ms), and a Playwright browser adapter (280ms). The test never changes — only the adapter does.

## See It In Action

The [Task Board Example](example-app) is a complete React + Express app tested across all three adapters — unit, HTTP, and Playwright — with a single set of domain-language tests.

## Packages

| Package | Description |
|:--------|:------------|
| [`@aver/core`](https://github.com/njackson/aver/tree/main/packages/core) | Core framework — domains, adapters, suite, CLI |
| `@aver/approvals` | Approval testing — structural diffs and visual screenshot comparison |
| `@aver/workspace` | Scenario workspace — maturity pipeline state management |
| `@aver/protocol-http` | HTTP protocol adapter (fetch-based) |
| `@aver/protocol-playwright` | Playwright browser protocol adapter |
| `@aver/mcp-server` | MCP server for AI-assisted testing |
| `@aver/agent-plugin` | Agent plugin — MCP server + maturity pipeline workflow skill |
