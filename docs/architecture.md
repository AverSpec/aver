---
layout: default
title: Architecture
nav_order: 3
---

# Architecture

Aver implements a three-layer acceptance testing architecture inspired by Dave Farley's work on continuous delivery and the Screenplay pattern from Serenity.js.

The name "aver" means "to declare with confidence" — your tests aver that the system behaves as intended.

## The Three Layers

```
Domain (what)  →  Adapter (how)  →  Test (verify)
```

### Layer 1: Domain

A domain declares the vocabulary of a bounded context. It is a pure type contract with no implementation — just names and type signatures for actions, queries, and assertions.

```typescript
export const shoppingCart = defineDomain({
  name: 'shopping-cart',
  actions: {
    addItem: action<{ name: string; qty: number }>(),
    checkout: action(),
  },
  queries: {
    cartTotal: query<void, number>(),
  },
  assertions: {
    hasItems: assertion<{ count: number }>(),
  },
})
```

Domains are the stable center of your test suite. They change only when business requirements change — never because of implementation details.

### Layer 2: Adapter

An adapter implements a domain for a specific protocol. The `implement()` function enforces that every action, query, and assertion declared in the domain is provided.

```typescript
import { expect } from 'vitest'

export const unitAdapter = implement(shoppingCart, {
  protocol: unit(() => new Cart()),
  actions: {
    addItem: async (cart, { name, qty }) => cart.add(name, qty),
    checkout: async (cart) => cart.checkout(),
  },
  queries: {
    cartTotal: async (cart) => cart.total,
  },
  assertions: {
    hasItems: async (cart, { count }) => {
      expect(cart.items.length).toBe(count)
    },
  },
})
```

The first argument to every handler is the **protocol context** — whatever the protocol's `setup()` returns. For `unit()`, that's your in-memory object. For `playwright()`, it's a Playwright `Page`. For `http()`, it's an HTTP client.

### Layer 3: Tests

Tests declare their domain dependency via `suite()`. They speak only domain language:

```typescript
const { test } = suite(shoppingCart)

test('full checkout flow', async ({ given, when, then, query }) => {
  await given.addItem({ name: 'Widget', qty: 2 })
  await then.hasItems({ count: 1 })
  const total = await query.cartTotal()
  expect(total).toBe(19.98)
  await when.checkout()
})
```

This test runs identically against a unit adapter, an HTTP adapter, or a Playwright browser adapter. The test never changes — only the adapter does.

## Domain Vocabulary

Three concepts make up the domain language:

| Concept | Purpose | Returns | Example |
|:--------|:--------|:--------|:--------|
| **Action** | Do something (side effect) | void | `addItem`, `checkout` |
| **Query** | Read something | typed data | `cartTotal`, `orderStatus` |
| **Assertion** | Check something | pass/fail | `hasItems`, `orderConfirmed` |

Actions perform operations. Queries extract data. Assertions verify expectations.

Assertions could technically be expressed as query + expect, but they earn their place because:
- They express intent in domain language
- They enable protocol-optimized checks (Playwright's auto-waiting `toHaveText` vs manual poll-and-compare)
- They produce better action traces on failure

## Given/When/Then Aliases

Tests can use `given`, `when`, and `then` as narrative aliases for `act` and `assert`:

| Alias | Delegates to | Purpose |
|:------|:-------------|:--------|
| `given` | `act` | Setup — establish preconditions |
| `when` | `act` | Trigger — perform the action under test |
| `then` | `assert` | Verify — check outcomes |

These aliases produce distinct labels in the action trace:

```
Action trace (unit):
  [PASS] GIVEN  ShoppingCart.addItem({"name":"Widget","qty":2})  12ms
  [PASS] WHEN   ShoppingCart.checkout()  45ms
  [PASS] THEN   ShoppingCart.totalCharged({"amount":35})  2ms
```

The raw `act`, `query`, and `assert` names remain available for tests where the Given/When/Then framing doesn't fit. All six accessors (`act`, `given`, `when`, `query`, `assert`, `then`) call the same adapter handlers — the difference is purely in trace labeling.

## Protocols

A protocol manages session lifecycle and provides context to adapter handlers:

```typescript
interface Protocol<Context> {
  readonly name: string
  setup(): Promise<Context>
  teardown(ctx: Context): Promise<void>
  onTestStart?(ctx: Context, meta: TestMetadata): Promise<void> | void
  onTestFail?(ctx: Context, meta: TestCompletion): Promise<TestFailureResult> | TestFailureResult
  onTestEnd?(ctx: Context, meta: TestCompletion): Promise<void> | void
  extensions?: ProtocolExtensions
}
```

Beyond `setup()` and `teardown()`, protocols can hook into test lifecycle events. `onTestStart` runs before each test body. `onTestFail` runs on failure and can return attachments (e.g., Playwright captures a screenshot). `onTestEnd` runs after each test for cleanup. The `extensions` field exposes protocol-specific capabilities like `Screenshotter` for visual approvals.

Aver ships three protocols:

| Protocol | Context | Use Case |
|:---------|:--------|:---------|
| `unit(factory)` | Your object | In-memory / unit-speed testing |
| `http({ baseUrl })` | HTTP client | API-level testing |
| `playwright()` | Playwright `Page` | Browser UI testing |

The `unit()` protocol is built into core (zero dependencies). The `http()` and `playwright()` protocols are separate packages.

## Multi-Adapter Resolution

When you call `suite(domain)` without passing an adapter, Aver resolves adapters from the registry:

```typescript
// aver.config.ts
export default defineConfig({
  adapters: [unitAdapter, httpAdapter, playwrightAdapter],
})
```

```typescript
// test file
const { test } = suite(shoppingCart)  // runs against all 3 adapters
```

Output:

```
 ✓ add item to cart [unit]           1ms
 ✓ add item to cart [http]          12ms
 ✓ add item to cart [playwright]   280ms
```

Each test runs once per adapter with an isolated protocol context. Test names are parameterized with the protocol name.

## Domain Extensions

Domains can be extended with additional vocabulary:

```typescript
export const shoppingCartUI = shoppingCart.extend('shopping-cart-ui', {
  assertions: {
    showsLoadingSpinner: assertion(),
  },
})
```

Extensions inherit all vocabulary from the parent domain and add new items. An adapter for the extended domain must implement everything from both the parent and the extension.

## Error Reporting

On failure, Aver shows the action trace — every domain operation leading to the error:

```
FAIL  shopping-cart.spec.ts > full checkout flow [unit]

Action trace (unit):
  [PASS] GIVEN  ShoppingCart.addItem({"name":"Widget","qty":2})  12ms
  [PASS] THEN   ShoppingCart.hasItems({"count":1})  1ms
  [PASS] QUERY  ShoppingCart.cartTotal()  0ms
  [FAIL] WHEN   ShoppingCart.checkout() — Expected order to be confirmed  45ms

  Expected order to be confirmed
```

The trace is recorded automatically by `suite()` as it proxies domain calls through the adapter. Each step is logged as it executes, so failures show the full sequence leading to the error.

## Design Principles

- **Zero runtime dependencies** in core — `@aver/core` has no deps. Protocols are separate packages.
- **TypeScript-first** — phantom types enforce that adapters implement every domain item. Queries and assertions are typed end-to-end.
- **Adapter authors receive ready-to-use context** — protocols handle lifecycle (launching browsers, creating HTTP clients). Adapter code focuses on domain logic.
- **Tests are protocol-agnostic** — they import domains, never adapters. The same test runs everywhere.

## Economics

The cost model determines when Aver earns its keep.

**Cost per domain operation:** One vocabulary entry in the domain definition, plus one handler per adapter. At one adapter, this is comparable to extracting a page object method — you're doing the same factoring work, just in a standard shape. At three adapters, it's a 1:3 ratio (one vocabulary entry, three handlers), but each handler is isolated and self-contained.

**What grows with what:** Vocabulary grows with *domain surface area* — the number of distinct behaviors your system exposes. Tests grow with *scenarios* — the number of ways those behaviors compose. Domain surface area grows slowly; scenarios grow fast. Five domain operations can support fifty tests that compose them in different ways. The adapter investment is amortized across every scenario that uses those operations.

**The breakeven:** With a single adapter, Aver's overhead is roughly equal to well-structured page objects or helper functions — you'd extract those anyway. The cross-adapter benefit kicks in at the second adapter: when two adapters disagree on a behavior, that disagreement surfaces a real bug (API returns different data than the UI shows, unit layer assumes state the integration layer doesn't create). By the time you have two adapters, the bugs caught by cross-level verification exceed the cost of maintaining two sets of handlers.

## Package Separation: Agent Packages

The agent-related functionality is split across three packages, each with a distinct role and dependency profile:

| Package | Purpose | Dependencies |
|:--------|:--------|:-------------|
| `@aver/skills` | Pure markdown asset package | None — no deps, no build step |
| `@aver/agent-plugin` | Claude Code integration shim | Thin packaging layer |
| `@aver/agent` | Runtime with CycleEngine | Claude Agent SDK (optional peer dep) |

**`@aver/skills`** contains the workflow skill definitions as markdown files. It has zero dependencies and no build step. Because skills are plain markdown, they can be consumed by any tool — not just the Aver agent. An IDE extension, a different agent framework, or a human reviewer can all read and use the skill definitions directly.

**`@aver/agent-plugin`** is a thin packaging layer that copies skills and configures the MCP server for the Claude Code plugin system. It bridges `@aver/skills` and `@aver/mcp-server` into a format Claude Code understands. It exists solely to keep plugin plumbing out of the other packages.

**`@aver/agent`** is the heavy runtime package. It contains the CycleEngine (supervisor/worker dispatch), session management, and shell verification logic. It depends on the Claude Agent SDK as an optional peer dependency. Most users of the testing framework never need this package.

The separation ensures that users who only want the testing framework (`@aver/core` + protocol packages) do not pull in AI SDK dependencies. A team using Aver purely for multi-adapter acceptance testing has zero exposure to agent code.

## Using Aver with AI Agents

`aver run` returning exit code 0 is a machine-verifiable success criterion that any agent framework can use. You don't need `@aver/agent` to get this benefit.

```bash
# Any agent can use this as its verification step
npx aver run
echo $?  # 0 = all behavioral specs pass, non-zero = failures
```

If your agent framework supports running shell commands and checking exit codes, it can use Aver as its verification layer:

1. Define your domain vocabulary and write behavioral specs
2. Have your agent implement code
3. Run `npx aver run` — if it exits 0, the implementation satisfies the spec
4. If it exits non-zero, the agent has failing tests to work from

This works with Claude Code, Cursor, Cline, Aider, or any agent that can run tests. The domain vocabulary defines correctness; `aver run` verifies it. The agent is a consumer of the testing framework, not a prerequisite for it.

Aver also ships `@aver/agent` — a purpose-built agent that drives the scenario pipeline and uses `aver run` as its own success criterion. But the testing framework stands alone.
