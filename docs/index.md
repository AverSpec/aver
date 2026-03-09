---
layout: default
title: Home
nav_order: 1
---

# Aver

Know your system works.
{: .fs-6 .fw-300 }

Domain-driven acceptance testing for TypeScript.
{: .fs-5 .fw-300 }

[Tutorial](tutorial){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[GitHub](https://github.com/njackson/aver){: .btn .fs-5 .mb-4 .mb-md-0 }

---

## Lock it down. Name it. Prove it.

Most teams don't start with a green field. They start with code that works — probably — and the mandate to change it without breaking anything. Aver meets you wherever you are in that journey.

### Lock it down — start with what you have

Legacy systems have it worst. The test pyramid is inverted, most coverage lives at the E2E level because the code wasn't designed for unit testing. The usual advice is to add unit tests, but that requires refactoring, which requires tests you don't have.

Aver breaks the cycle. Start with `approve()` to lock in current behavior as a snapshot. You don't need to understand the system yet — just capture what it does today so you'll know when something changes tomorrow.

```typescript
test('checkout flow produces order confirmation', async () => {
  const result = await checkout(cart)
  await approve(result, 'checkout-confirmation')
})
```

First you lock in what the system does. Then you name what it *should* do.

### Name it — extract a shared vocabulary

As understanding deepens, patterns emerge. "Create a task," "move it to in-progress," "verify it landed" — these are domain operations, not implementation details. Aver gives you a spine to name them once and run them at every level.

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

Same test. Three adapters. Zero code duplication. When two adapters disagree on a behavior, that disagreement surfaces a real bug — not a flaky test.

**Domains** declare vocabulary — actions, queries, and assertions in business language. **Adapters** bind that vocabulary to real systems. **Tests** speak only domain language and run against any adapter.

```
Domain (what)  →  Adapter (how)  →  Test (verify)
```

The pyramid grows *inward*, from E2E toward unit, instead of the usual advice of building from unit outward. Start with an E2E adapter — that's the only handle you have into a tightly coupled system. As you refactor and create clean internal boundaries, add adapters at each new seam.

### Prove it — verify your system is observable

Correct behavior isn't enough. Your system can pass every test and still be a black box in production — spans missing, traces disconnected, the relationships between operations silently destroyed. Observability data is made powerful by context: the connections between a checkout span, a payment span, and a fulfillment span are worth more than any of them alone. When those connections break, your dashboards go dark and your agents can't validate what they shipped.

Aver lets you declare expected telemetry alongside domain operations and verify that the relational seams hold.

```typescript
checkout: action<{ orderId: string }>({
  telemetry: (p) => ({
    span: 'order.checkout',
    attributes: { 'order.id': p.orderId },
  }),
}),
fulfillOrder: action<{ orderId: string }>({
  telemetry: (p) => ({
    span: 'order.fulfill',
    attributes: { 'order.id': p.orderId },
  }),
}),
```

Both operations declare `order.id`. When a test calls both with the same value, Aver automatically verifies two things: each span carries the right attributes, and the spans are causally connected — same trace or linked. If someone refactors the fulfillment handler and breaks the trace propagation, the test fails before it ships.

The same test that proves "checkout creates an order" also proves "checkout and fulfillment are connected in the trace." Observability becomes a testable contract — not just "do the spans exist?" but "are the relationships intact?"

---

## Economics

Five domain operations can support fifty tests that compose them in different ways. Vocabulary grows with *domain surface area* (slowly). Tests grow with *scenarios* (fast). The adapter investment is amortized across every scenario.

With a single adapter, Aver's overhead matches well-structured page objects — you'd extract those anyway. The cross-adapter benefit kicks in at the second adapter, and the telemetry verification benefit is there from the first test.

---

## Quick start

```bash
npm install --save-dev @aver/core vitest
npx aver init --domain TaskBoard --protocol unit
npx aver run
```

Or follow a tutorial: [legacy code](tutorial) or [greenfield](tutorial-greenfield).

---

## Packages

### Core

| Package | Description |
|:--------|:------------|
| [`@aver/core`](https://github.com/njackson/aver/tree/main/packages/core) | Domains, adapters, suite, CLI. Zero runtime dependencies. |
| [`@aver/approvals`](https://github.com/njackson/aver/tree/main/packages/approvals) | Approval testing — structural diffs and visual screenshots |
| [`@aver/telemetry`](https://github.com/njackson/aver/tree/main/packages/telemetry) | Dev-to-prod telemetry verification — contract extraction and conformance checking |
| [`@aver/protocol-http`](https://github.com/njackson/aver/tree/main/packages/protocol-http) | HTTP protocol adapter (fetch-based) |
| [`@aver/protocol-playwright`](https://github.com/njackson/aver/tree/main/packages/protocol-playwright) | Playwright browser protocol adapter |

### AI-assisted testing

| Package | Description |
|:--------|:------------|
| [`@aver/agent-plugin`](https://github.com/njackson/aver/tree/main/packages/agent-plugin) | Claude Code plugin — MCP server + workflow and telemetry skills |
| [`@aver/mcp-server`](https://github.com/njackson/aver/tree/main/packages/mcp-server) | MCP server for AI-assisted scenario management |
| [`@aver/workspace`](https://github.com/njackson/aver/tree/main/packages/workspace) | Scenario workspace — storage, operations, backlog |
