---
layout: default
title: Architecture
nav_order: 5
---

# Architecture

Aver implements a three-layer acceptance testing architecture inspired by Dave Farley's work on continuous delivery and the Screenplay pattern from Serenity.js.

The name "aver" means "to declare with confidence" — your tests aver that the system behaves as intended.

## The three layers

```
Domain (what)  →  Adapter (how)  →  Test (verify)
```

**Domain** declares the vocabulary of a bounded context — what the system does, in business language. No implementation details. Just names and type signatures for actions, queries, and assertions.

**Adapter** binds the vocabulary to a real implementation via a protocol. One adapter per interaction mode: unit (in-memory), HTTP (API), Playwright (browser). The `adapt()` function enforces at compile time that every domain operation has a handler.

**Test** composes domain operations into scenarios. Tests never import adapters — they speak only domain language. The suite resolves adapters from configuration at runtime.

### Why three layers, not two

Page objects and test helpers give you two layers: tests and implementation. This works until you need the same behavior verified at multiple levels. With two layers, you either duplicate test logic per level or couple tests to a specific protocol.

The domain layer is the missing abstraction. It sits between your tests and your implementation, giving both a shared language. Tests compose domain operations without knowing the protocol. Adapters implement domain operations without knowing the tests. The domain is the contract that lets both sides evolve independently.

## Domain vocabulary

Three concepts make up the domain language:

| Concept | Purpose | Returns |
|:--------|:--------|:--------|
| **Action** | Do something (side effect) | void |
| **Query** | Read something | typed data |
| **Assertion** | Check something | pass/fail |

Actions perform operations. Queries extract data. Assertions verify expectations.

Assertions could be expressed as query + expect, but they earn their place because they express intent in domain language, enable protocol-optimized checks (Playwright's auto-waiting vs manual polling), and produce better traces on failure.

### Given/When/Then

Tests can use `given`, `when`, and `then` as narrative aliases for `act` and `assert`. They call the same adapter handlers — the difference is in trace labeling:

```
Action trace (unit):
  [PASS] GIVEN  ShoppingCart.addItem({"name":"Widget","qty":2})  12ms
  [PASS] WHEN   ShoppingCart.checkout()  45ms
  [PASS] THEN   ShoppingCart.totalCharged({"amount":35})  2ms
```

## Protocols

A protocol manages session lifecycle. It creates a context in `setup()` that every adapter handler receives as its first argument, and cleans up in `teardown()`.

For the `unit` protocol, the context is your in-memory object. For `playwright`, it's a Playwright `Page`. For `http`, it's an HTTP client pointed at a running server.

Protocols can also hook into test lifecycle events: `onTestStart` runs before each test body, `onTestFail` runs on failure and can return attachments (screenshots, logs), and `onTestEnd` runs after each test for cleanup.

Aver ships three protocols:

| Protocol | Context | Use Case |
|:---------|:--------|:---------|
| `unit(factory)` | Your object | In-memory / unit-speed testing |
| `http({ baseUrl })` | HTTP client | API-level testing |
| `playwright()` | Playwright `Page` | Browser UI testing |

The `unit` protocol is built into core (zero dependencies). HTTP and Playwright are separate packages.

You can write custom protocols for any interaction mode — WebSocket, gRPC, CLI, whatever your system exposes.

### Protocol composition with `withFixture`

`withFixture(protocol, { before?, after? })` wraps a protocol with setup/teardown hooks — useful when an adapter needs external infrastructure (a database, a server process) that sits outside the protocol's own context:

```typescript
import { withFixture } from '@aver/core'
import { http } from '@aver/protocol-http'

const httpWithServer = withFixture(http({ baseUrl: 'http://localhost:3000' }), {
  before: () => startServer(),
  after: () => stopServer(),
})
```

`before` runs before `protocol.setup()`. `after` runs after `protocol.teardown()`, even if teardown throws. All other protocol behavior (lifecycle hooks, telemetry) passes through unchanged.

## Multi-adapter resolution

When you register multiple adapters for the same domain, every test runs against all of them automatically:

```
 ✓ add item to cart [unit]           1ms
 ✓ add item to cart [http]          12ms
 ✓ add item to cart [playwright]   280ms
```

Each test gets an isolated protocol context. Test names are parameterized with the protocol name. When two adapters disagree on a behavior, that disagreement surfaces a real bug.

You can filter adapters at runtime with `AVER_ADAPTER=unit` to run only the fast tests during development.

### Cross-domain composition with named-config `suite()`

When a test scenario spans multiple bounded contexts, `suite()` accepts a named config object instead of a single domain. Each key maps to a `[domain, adapter]` tuple, and the test callback receives a context with a namespace per key:

```typescript
const { test } = suite({
  cart: [shoppingCart, cartAdapter],
  payments: [paymentGateway, paymentAdapter],
})

test('checkout charges the card', async ({ cart, payments }) => {
  await cart.given.addItem({ name: 'Widget', qty: 1 })
  await cart.when.checkout()
  await payments.then.chargeRecorded({ amount: 25 })
})
```

Each domain gets its own protocol lifecycle. The shared `trace()` function on the context collects trace entries from all domains in execution order.

## Domain extensions

Domains can be extended with additional vocabulary for protocol-specific concerns:

```typescript
const taskBoardUI = taskBoard.extend('task-board-ui', {
  assertions: {
    showsLoadingSpinner: assertion(),
  },
})
```

Extensions inherit all vocabulary from the parent. An adapter for the extended domain must implement everything from both the parent and the extension. This lets you write shared behavioral tests against the base domain, and protocol-specific tests against the extension.

## Error reporting

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

The trace is recorded automatically as the suite proxies domain calls through the adapter. Each step is logged as it executes, so failures show the full sequence leading to the error.

## Telemetry verification

Observability data is made powerful by context — the relationships between spans matter more than any individual span. A checkout span alone tells you little. A checkout span causally connected to a payment span and a fulfillment span, all sharing an order ID within the same trace, tells you the whole story. When those relational seams break — a refactor drops the trace propagation, a renamed attribute disconnects two spans — your dashboards go dark and your agents can't validate what they shipped.

Aver treats these relationships as a testable contract. Domains declare expected OTel spans on operations, and the framework verifies both the spans and their connections.

Two verification layers run automatically:
1. **Per-step**: After each operation, verify a matching span exists with the expected name and attributes
2. **End-of-test correlation**: After all steps, verify that correlated steps (shared attribute key + value) are causally connected — same traceId or span links

This catches instrumentation bugs that behavioral tests miss: the API returns the right data, but the spans are missing, misnamed, or disconnected. The `@aver/telemetry` package extends this to production — extract a behavioral contract from passing tests, then verify that production traces conform to the same contract. See the [telemetry guide](guides/telemetry) for details.

## Design principles

- **Zero runtime dependencies** in core. Protocols are separate packages.
- **TypeScript-first** — phantom types enforce that adapters implement every domain item.
- **Adapter authors receive ready-to-use context** — protocols handle lifecycle.
- **Tests are protocol-agnostic** — they import domains, never adapters.

## Economics

The cost model determines when Aver earns its keep.

**What grows with what:** Vocabulary grows with *domain surface area* — the number of distinct behaviors. Tests grow with *scenarios* — the number of ways those behaviors compose. Surface area grows slowly; scenarios grow fast. Five domain operations can support fifty tests.

**Cost per operation:** One vocabulary entry in the domain, plus one handler per adapter. At one adapter, this is comparable to extracting a page object method. At three adapters, it's a 1:3 ratio — but each handler is isolated.

**The breakeven:** With a single adapter, Aver's overhead roughly equals well-structured page objects. The cross-adapter benefit kicks in at the second adapter. By the time you have two adapters, the bugs caught by cross-level verification exceed the cost of maintaining two sets of handlers.

## AI agent integration

`aver run` returning exit code 0 is a machine-verifiable success criterion. Any agent framework that can run shell commands can use Aver as its verification layer:

1. Define domain vocabulary and write behavioral specs
2. Have your agent implement code
3. Run `npx aver run` — exit 0 means the implementation satisfies the spec
4. Exit non-zero gives the agent failing tests to work from

This works with Claude Code, Cursor, Cline, Aider, or any agent that can run tests. The domain vocabulary defines correctness; `aver run` verifies it.

Aver also ships an `@aver/agent-plugin` for Claude Code that provides workflow skills for scenario management, telemetry design, and OTel context propagation, plus bash scripts for issue tracking via GitHub Issues or Linear.
