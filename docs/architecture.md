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
      if (cart.items.length !== count)
        throw new Error(`Expected ${count} items`)
    },
  },
})
```

The first argument to every handler is the **protocol context** — whatever the protocol's `setup()` returns. For `unit()`, that's your in-memory object. For `playwright()`, it's a Playwright `Page`. For `http()`, it's an HTTP client.

### Layer 3: Tests

Tests declare their domain dependency via `suite()`. They speak only domain language:

```typescript
const { test } = suite(shoppingCart)

test('full checkout flow', async ({ act, query, assert }) => {
  await act.addItem({ name: 'Widget', qty: 2 })
  await assert.hasItems({ count: 1 })
  const total = await query.cartTotal()
  expect(total).toBe(19.98)
  await act.checkout()
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

## Protocols

A protocol manages session lifecycle and provides context to adapter handlers:

```typescript
interface Protocol<Context> {
  name: string
  setup(): Promise<Context>
  teardown(ctx: Context): Promise<void>
}
```

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
export const shoppingCartUI = shoppingCart.extend({
  name: 'shopping-cart-ui',
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
  [PASS] ShoppingCart.addItem({"name":"Widget","qty":2})
  [PASS] ShoppingCart.hasItems({"count":1})
  [PASS] ShoppingCart.cartTotal()
  [FAIL] ShoppingCart.checkout() — Expected order to be confirmed

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
