# Aver Core Design

**Status**: Draft

---

## Overview

Aver is a domain-driven acceptance testing framework for AI-assisted development. It implements Dave Farley's 4-layer acceptance test architecture as a TypeScript-first library with an optional CLI.

The name means "to declare with confidence" -- your tests aver that the system behaves as intended.

**One-line pitch**: Serenity.js concepts, Playwright speed, TypeScript ergonomics, AI-native via MCP.

This document defines the concrete API surface for the MVP and the design direction for future phases.

## Terminology

- **Protocol** -- the underlying technology, provided by Aver (`playwright`, `http`, `direct`). Handles lifecycle (launching browsers, creating clients).
- **Adapter** -- what the user creates. A domain implemented for a specific protocol. The result of `implement()`.
- **Domain** -- pure vocabulary defining actions, queries, and assertions. No implementation.

## Domain Vocabulary

Three concepts make up the domain language:

| Concept | Purpose | Returns |
|---|---|---|
| **Action** | Do something (side effect) | void |
| **Query** | Read something | typed data |
| **Assertion** | Check something | pass/fail |

Actions perform operations. Queries extract data. Assertions verify expectations. This distinction comes from the Screenplay pattern (Serenity.js) but with simpler naming.

Assertions could technically be expressed as query + expect, but they earn their place because:
- They express intent in domain language
- They enable protocol-optimized checks (Playwright's auto-waiting `toHaveText` vs manual poll-and-compare)
- They produce better action traces

## Three-Layer Architecture

### Layer 1: Domain

A domain declares the vocabulary of a bounded context. It is a pure type contract with no implementation.

```ts
// tests/acceptance/domains/shopping-cart.ts
import { defineDomain, action, query, assertion } from 'aver'

export const shoppingCart = defineDomain({
  name: 'ShoppingCart',
  actions: {
    addItem: action<{ name: string; qty: number }>(),
    removeItem: action<{ name: string }>(),
    checkout: action(),
  },
  queries: {
    cartTotal: query<number>(),
    orderSummary: query<string>(),
    itemCount: query<number>(),
  },
  assertions: {
    hasTotal: assertion<{ amount: number }>(),
    containsItem: assertion<{ name: string }>(),
    isEmpty: assertion(),
  },
})
```

- `action<P>()` -- type param for payload. No payload = `action()`.
- `query<R>()` -- type param for return type.
- `assertion<P>()` -- type param for what you're checking against.

#### Domain Extensions

Domains can be extended with protocol-specific vocabulary. Extensions are typed to a protocol, ensuring only matching adapters can implement them.

```ts
import type { PlaywrightProtocol } from 'aver/protocols'

export const shoppingCartUI = shoppingCart.extend<PlaywrightProtocol>({
  assertions: {
    showsLoadingSpinner: assertion(),
    showsConfirmationPage: assertion(),
  },
})
```

Extensions inherit all actions, queries, and assertions from the parent domain. The type parameter constrains which protocol can implement the extension.

This solves adapter-specific tests without tags or configuration. A test that imports `shoppingCartUI` can only run on adapters that implement it (Playwright), and this is enforced at both compile time and runtime.

### Layer 2: Adapter

An adapter implements a domain for a specific protocol. The `implement()` function enforces that every action, query, and assertion declared in the domain is provided.

```ts
// tests/acceptance/adapters/shopping-cart.browser.ts
import { implement } from 'aver'
import { playwright } from 'aver/protocols'
import { shoppingCartUI } from '../domains/shopping-cart'

export const browserCart = implement(shoppingCartUI, {
  protocol: playwright(),
  actions: {
    addItem: async (page, { name, qty }) => {
      await page.locator(`[data-product="${name}"]`).click()
      await page.locator('[data-qty]').fill(String(qty))
      await page.locator('[data-add-to-cart]').click()
    },
    removeItem: async (page, { name }) => {
      await page.locator(`[data-cart-item="${name}"] [data-remove]`).click()
    },
    checkout: async (page) => {
      await page.locator('[data-checkout]').click()
    },
  },
  queries: {
    cartTotal: async (page) => {
      const text = await page.locator('[data-cart-total]').textContent()
      return parseFloat(text.replace('$', ''))
    },
    orderSummary: async (page) => {
      return await page.locator('#order-summary').textContent()
    },
    itemCount: async (page) => {
      return await page.locator('[data-cart-item]').count()
    },
  },
  assertions: {
    hasTotal: async (page, { amount }) => {
      await expect(page.locator('[data-cart-total]')).toHaveText(`$${amount}`)
    },
    containsItem: async (page, { name }) => {
      await expect(page.locator(`[data-cart-item="${name}"]`)).toBeVisible()
    },
    isEmpty: async (page) => {
      await expect(page.locator('[data-cart-empty]')).toBeVisible()
    },
    showsLoadingSpinner: async (page) => {
      await expect(page.locator('.spinner')).toBeVisible()
    },
    showsConfirmationPage: async (page) => {
      await expect(page.locator('#confirmation')).toBeVisible()
    },
  },
})
```

Key design points:

- The first argument to every handler is the **protocol context** (`page` for Playwright, `client` for HTTP). The protocol's lifecycle provides this -- adapter authors just receive it.
- TypeScript enforces exhaustiveness. Missing an action, query, or assertion is a compile error.
- Assertions use native tools (Vitest `expect`, Playwright's built-in matchers). No custom assertion API.
- Queries return typed values matching the `query<R>()` declaration.

#### Same Domain, Different Protocol

```ts
// tests/acceptance/adapters/shopping-cart.api.ts
import { implement } from 'aver'
import { http } from 'aver/protocols'
import { shoppingCart } from '../domains/shopping-cart'

export const apiCart = implement(shoppingCart, {
  protocol: http({ baseUrl: 'http://localhost:3000' }),
  actions: {
    addItem: async (client, { name, qty }) => {
      await client.post('/cart/items', { name, qty })
    },
    removeItem: async (client, { name }) => {
      await client.delete(`/cart/items/${name}`)
    },
    checkout: async (client) => {
      await client.post('/cart/checkout')
    },
  },
  queries: {
    cartTotal: async (client) => {
      const cart = await client.get('/cart')
      return cart.total
    },
    orderSummary: async (client) => {
      const cart = await client.get('/cart')
      return cart.summary
    },
    itemCount: async (client) => {
      const cart = await client.get('/cart')
      return cart.items.length
    },
  },
  assertions: {
    hasTotal: async (client, { amount }) => {
      const cart = await client.get('/cart')
      expect(cart.total).toBe(amount)
    },
    containsItem: async (client, { name }) => {
      const cart = await client.get('/cart')
      expect(cart.items.some(i => i.name === name)).toBe(true)
    },
    isEmpty: async (client) => {
      const cart = await client.get('/cart')
      expect(cart.items).toHaveLength(0)
    },
  },
})
```

Note: the API adapter implements `shoppingCart` (base domain), not `shoppingCartUI` (extension). It doesn't provide browser-specific assertions. Tests using `shoppingCartUI` will only run against the browser adapter.

### Layer 3: Tests

Test files declare their domain dependency via `suite()`. They never import adapters.

```ts
// tests/acceptance/shopping-cart.spec.ts
import { suite } from 'aver'
import { shoppingCart } from './domains/shopping-cart'

const { test } = suite(shoppingCart)

test('add item and check total', async () => {
  await shoppingCart.addItem({ name: 'Widget', qty: 2 })
  await shoppingCart.containsItem({ name: 'Widget' })
  await shoppingCart.hasTotal({ amount: 19.98 })
})

test('empty cart by default', async () => {
  await shoppingCart.isEmpty()
})

test('can query cart total', async () => {
  await shoppingCart.addItem({ name: 'Widget', qty: 2 })
  const total = await shoppingCart.cartTotal()
  // total is typed as number
})
```

Browser-specific tests import the extended domain:

```ts
// tests/acceptance/shopping-cart-ui.spec.ts
import { suite } from 'aver'
import { shoppingCartUI } from './domains/shopping-cart'

const { test } = suite(shoppingCartUI)

test('shows spinner during checkout', async () => {
  await shoppingCartUI.checkout()
  await shoppingCartUI.showsLoadingSpinner()
})
```

#### How `suite()` Works

`suite()` does three things behind the scenes:

1. **Registers** the domain dependency so the runner can filter and skip incompatible tests
2. **Attaches lifecycle** -- `beforeAll` sets up the protocol context, `afterAll` tears it down
3. **Returns a wrapped `test`** that proxies domain calls through the active adapter and records each step for the action trace

## Runtime Resolution

### Config File

Adapters are registered in the config file. The runner uses this to build the domain-to-adapter graph.

```ts
// aver.config.ts
import { defineConfig } from 'aver'
import { browserCart } from './tests/acceptance/adapters/shopping-cart.browser'

export default defineConfig({
  testDir: './tests/acceptance',
  adapters: [browserCart],
})
```

### Adapter Selection

The runner resolves adapters via CLI flags and config:

```bash
aver run                                        # all tests, all adapters
aver run --adapter=playwright                   # browser-compatible tests only
aver run --adapter=http                         # API-compatible tests only
aver run --domain=ShoppingCart                   # one domain, all adapters
aver run --domain=ShoppingCart --adapter=http    # intersection
```

When `suite(domain)` is called, the runner checks which registered adapters implement that domain (or a parent of it). If the active adapter doesn't implement the domain, the test file is skipped.

### Protocol Lifecycle

Protocols handle their own setup and teardown. Adapter authors just receive the ready-to-use context object.

- `playwright()` -- launches browser, creates page, provides `page` to handlers, closes on teardown
- `http()` -- creates configured HTTP client, provides `client` to handlers

This keeps adapter code focused on domain logic, not infrastructure.

## Error Reporting

Errors speak domain language first, with raw adapter details as a drill-down.

```
FAIL  shopping-cart.spec.ts > add item and check total

  ShoppingCart.addItem({ name: 'Widget', qty: 2 })   ✓
  ShoppingCart.containsItem({ name: 'Widget' })       ✓
  ShoppingCart.hasTotal({ amount: 19.98 })             ✗

  Expected total of $19.98, got $15.00

  Caused by:
    expect(locator('[data-cart-total]')).toHaveText('$19.98')
    Received: '$15.00'
    at adapters/shopping-cart.browser.ts:42
```

The action trace is recorded automatically by `suite()` proxying domain calls. Each step is logged as it executes, so failures show the full sequence leading to the error.

## Runner Integration

Aver's core library works in any test runner with standard globals (`test`, `describe`, `beforeAll`, `afterAll`, `expect`). This means Vitest and Jest are both supported.

- **`import { ... } from 'aver'`** -- the library. Works in Vitest, Jest, or any compatible runner.
- **`aver run`** -- the CLI convenience. Wraps Vitest under the hood for zero-config startup.

`suite()` uses the globally available test primitives, so it doesn't need to know which runner is executing.

## CLI

### `aver run`

Runs tests. Wraps Vitest under the hood.

```bash
aver run                                        # all tests, all adapters
aver run --adapter=playwright                   # filter by adapter
aver run --domain=ShoppingCart                   # filter by domain
aver run --domain=ShoppingCart --adapter=http    # intersection
```

### `aver init`

Scaffolds a new domain with the three-layer structure. Generates real, editable code.

```bash
aver init --domain ShoppingCart --protocol playwright
```

Generates:

```
tests/
  acceptance/
    domains/
      shopping-cart.ts
    adapters/
      shopping-cart.browser.ts
    shopping-cart.spec.ts
aver.config.ts
```

## File Conventions

Default structure created by `aver init`:

```
tests/
  acceptance/
    domains/           # defineDomain() files
    adapters/          # implement() files
    *.spec.ts          # suite() + test files
aver.config.ts         # config at project root
```

The `testDir` config option allows customization.

Naming conventions:
- Domains: `<name>.ts` (e.g., `shopping-cart.ts`)
- Adapters: `<name>.<protocol>.ts` (e.g., `shopping-cart.browser.ts`, `shopping-cart.api.ts`)
- Tests: `<name>.spec.ts` (e.g., `shopping-cart.spec.ts`)

## Approval Testing (Phase 2 -- Design Only)

Approvals are a test-level utility, not a domain concept. They wrap query results.

```ts
import { suite, approve } from 'aver'
import { shoppingCart } from '../domains/shopping-cart'

const { test } = suite(shoppingCart)

test('order summary format', async () => {
  await shoppingCart.addItem({ name: 'Widget', qty: 1 })
  await shoppingCart.addItem({ name: 'Gadget', qty: 2 })

  await approve(shoppingCart.orderSummary())
})
```

### Scrubbing

Strips non-deterministic content before comparison:

```ts
await approve(shoppingCart.orderSummary(), {
  scrub: [/order-\d+/g, /\d{4}-\d{2}-\d{2}/g],
})
```

### Workflow

1. First run: no baseline exists, test marked `pending_approval`, received output saved
2. Developer reviews and approves -- becomes the baseline
3. Subsequent runs: received compared against baseline
4. If diff: test marked `pending_approval`, developer reviews and approves or rejects

### Storage

Baselines are per-adapter:

```
tests/
  acceptance/
    __approvals__/
      shopping-cart/
        order-summary-format.playwright.approved.txt
        order-summary-format.http.approved.json
```

### CLI

```bash
aver approve              # interactive review of pending approvals
aver approve --all        # approve all pending (use with caution)
```

### AI Agent Integration

Approvals are a natural human-in-the-loop gate. The agent cannot auto-approve changes to output shape. The developer maintains control over what the system produces.

## Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Runtime binding | `suite()` + config + CLI flag | Tests stay protocol-agnostic, runner resolves adapters |
| Adapter-specific tests | Domain composition via `.extend<Protocol>()` | Type-safe, no tags needed, implicit filtering |
| Domain vocabulary | Actions, queries, assertions | Clear separation of do/read/check. Queries enable approvals without polluting the domain |
| Convenience helper (`domainWith`) | Cut from MVP | Teaches a pattern that doesn't scale to multi-adapter |
| Runner | Vitest (with Jest compatibility) | Ship with Vitest, verify Jest works later |
| Adapter registration | Config file | Single entry point, follows ecosystem conventions |
| File structure | `tests/acceptance/` with domains/, adapters/ subdirs | Avoids conflicts with existing test dirs, clear scoping |
| Approvals | Phase 2, test-level utility | Design now, build later. Not a domain concept. |
| Error reporting | Domain-level first, raw adapter as "caused by" | Readable by anyone who knows the domain, debuggable by implementers |
| Protocol lifecycle | Protocol handles setup/teardown | Adapter authors receive ready-to-use context, less boilerplate |
| License | MIT | npm ecosystem default, allows commercial services on top |

## Open Questions (Remaining)

- **Query error handling**: What happens when a query returns unexpected data? Should there be a validation layer, or is that the adapter author's responsibility?
- **Parallel test execution**: How do protocol contexts handle parallelism? One browser per test file? Shared browser, separate pages?
- **Multi-domain tests**: Can a test file use `suite()` with multiple domains? Or should cross-domain tests compose at a higher level?
- **Watch mode**: Does `aver run --watch` need special handling beyond what Vitest provides?

## Phases (Updated)

### MVP / Cupcake
- `defineDomain()`, `action()`, `query()`, `assertion()`
- `.extend<Protocol>()` for domain extensions
- `implement()` with Playwright protocol
- `suite()` for test files
- `defineConfig()` with adapter registration
- `aver run` CLI wrapping Vitest
- `aver init` scaffolding
- Domain-level error reporting with action traces
- One example domain (e-commerce cart)
- README with Diataxis documentation framework

### Phase 2: Approvals & Adapters
- `approve()` utility with scrubbers
- Approval storage and CLI review workflow
- HTTP protocol (`http()`)
- Direct-call protocol (`direct()`)
- CI reporter (JUnit XML)

### Phase 3: AI-Native (MCP)
- MCP server for AI agent integration
- Context-budget-aware reporting
- Domain exploration tools
- Progressive disclosure

### Phase 4: Agent Skill
- Predictive TDD workflow skill
- ZOMBIES test planning
- Approval gate workflow
