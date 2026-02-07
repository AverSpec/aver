# Aver Core Design

**Date**: 2026-02-07
**Status**: Draft

---

## What is Aver?

Aver is a domain-driven acceptance testing framework for AI-assisted development. It implements Dave Farley's 4-layer acceptance test architecture as a TypeScript-first library with an optional CLI.

The name means "to declare with confidence" -- your tests aver that the system behaves as intended.

**One-line pitch**: Serenity.js concepts, Playwright speed, TypeScript ergonomics, AI-native via MCP.

## Core Architecture

Aver maps directly to Farley's 4-layer separation of concerns:

| Farley's Layer | Aver Concept | Responsibility |
|---|---|---|
| Test Cases | Spec files | Business-readable scenarios, protocol-agnostic |
| DSL | Domain | TypeScript interface defining what actions & assertions exist |
| Protocol Driver | Adapter | Implements the domain for a specific harness (browser, API, direct call) |
| System Under Test | (external) | The application being tested |

The key property: **test cases never know which protocol driver is running.** The same specs execute against browser, API, or direct code -- swapped by configuration, not by rewriting tests.

## Design Decisions

### Single package, split later

Distributed as `npm install aver`. Internally organized into `core/`, `adapters/`, `cli/` directories for a clean future split into `@aver/core`, `@aver/playwright`, etc. -- but only when there's a real reason to separate.

### Plain objects + type inference (no classes)

The API uses `defineDomain()` / `implement()` factory functions with TypeScript type inference. No base classes, no decorators. This follows the pattern established by Vitest, tRPC, and Zod -- idiomatic modern TypeScript.

### Runner-agnostic core + thin CLI

- `import { defineDomain, implement } from 'aver'` works in any test runner (Vitest, Jest, Playwright Test, etc.)
- `aver run` is a convenience CLI that wraps Vitest under the hood for zero-config getting-started
- `aver init` scaffolds a domain for new users

This mirrors Playwright's approach: `playwright` (library) works anywhere, `@playwright/test` (runner) provides a guided DX. Aver ships both in one package.

### TypeScript first, language-agnostic by design

The MVP is TypeScript/npm. The Domain/Action/Assertion model is designed to be portable -- future language SDKs (Python, Go) could implement the same concepts natively or as thin clients.

### Adapter model: Separate implementations (Farley-faithful)

The domain is a pure type contract. Each protocol driver implements all actions/assertions independently with protocol-native types. No generic adapter abstraction.

**Why not a generic adapter?**

- Generic verbs (`adapter.click()`) are a leaky abstraction -- `click()` doesn't exist in an API adapter
- AI agents generate more correct code when they receive explicit protocol types (`page` vs `client`)
- TypeScript can enforce exhaustiveness -- "you forgot to implement `addItem`" is a compile error
- Multi-adapter in practice is aspirational for MVP -- most teams will ship with one adapter
- A generic interface becomes a governance problem as new protocols are added (GraphQL, gRPC, CLI)

**Convenience wrapper for onboarding**: A `domainWith(playwright(), { ... })` helper collapses define + implement into one step for the single-adapter happy path. This solves the boilerplate problem without compromising the architecture.

## Core Concepts

### 1. Domains (DSL Layer)

A domain declares the vocabulary of a bounded context -- what actions users can take and what assertions can be made. It is a pure type contract with no implementation.

```ts
import { defineDomain, action, assertion, approval } from 'aver'

const shoppingCart = defineDomain({
  name: 'ShoppingCart',
  actions: {
    addItem: action<{ name: string; qty: number }>(),
    removeItem: action<{ name: string }>(),
    checkout: action(),
  },
  assertions: {
    hasTotal: assertion<{ amount: number }>(),
    containsItem: assertion<{ name: string }>(),
    isEmpty: assertion(),
  },
  approvals: {
    orderSummary: approval<string>(),
    cartState: approval<object>(),
  },
})
```

### 2. Adapters (Protocol Driver Layer)

An adapter implements the domain for a specific protocol. The `implement()` function enforces that every action, assertion, and approval declared in the domain is provided.

```ts
import { implement } from 'aver'
import { playwright } from 'aver/adapters'

const browserCart = implement(shoppingCart, {
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
  },
  approvals: {
    orderSummary: async (page) => {
      return await page.locator('#order-summary').textContent()
    },
    cartState: async (page) => {
      return JSON.parse(await page.locator('#cart-data').textContent())
    },
  },
})
```

Same domain, different protocol:

```ts
const apiCart = implement(shoppingCart, {
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
  approvals: {
    orderSummary: async (client) => {
      const cart = await client.get('/cart')
      return cart.summary
    },
    cartState: async (client) => {
      return await client.get('/cart')
    },
  },
})
```

#### Onboarding shorthand

For single-adapter domains (the common case), a convenience helper collapses define + implement:

```ts
import { domainWith } from 'aver'
import { playwright } from 'aver/adapters'

const cart = domainWith(playwright(), {
  name: 'ShoppingCart',
  actions: {
    addItem: async (page, { name, qty }: { name: string; qty: number }) => {
      await page.locator(`[data-product="${name}"]`).click()
    },
  },
  assertions: {
    hasTotal: async (page, { amount }: { amount: number }) => {
      await expect(page.locator('[data-cart-total]')).toHaveText(`$${amount}`)
    },
  },
})
```

### 3. Test Cases (Spec Layer)

Test cases use domain-level language. They are completely decoupled from the protocol driver.

```ts
import { shoppingCart } from './domains/shopping-cart'

test('should add item and see correct total', async () => {
  await shoppingCart.addItem({ name: 'Widget', qty: 2 })
  await shoppingCart.containsItem({ name: 'Widget' })
  await shoppingCart.hasTotal({ amount: 19.98 })
})

test('should start with empty cart', async () => {
  await shoppingCart.isEmpty()
})

test('should remove items from cart', async () => {
  await shoppingCart.addItem({ name: 'Widget', qty: 1 })
  await shoppingCart.removeItem({ name: 'Widget' })
  await shoppingCart.isEmpty()
})
```

The protocol driver is selected at runtime via configuration or CLI flag -- never in the test file itself.

### 4. Approval Testing

Approvals handle outputs too complex for simple assertions (formatted data, rendered HTML, API response structures, screenshots).

**How it works:**

```
Regular assertion:  expected === actual        → pass/fail (automated)
Approval:           received === approved       → diff review (human approves)
```

**Workflow:**

1. Test runs an approval, producing a "received" output
2. Framework compares against stored "approved" baseline
3. If no baseline exists or output differs, test is marked `pending_approval`
4. Developer reviews diff and approves or rejects
5. Approved output becomes the new baseline

**In tests:**

```ts
test('order summary format', async () => {
  await shoppingCart.addItem({ name: 'Widget', qty: 1 })
  await shoppingCart.addItem({ name: 'Gadget', qty: 2 })

  await approve(shoppingCart.orderSummary())
})
```

**Scrubbing** strips non-deterministic content before comparison:

```ts
await approve(
  shoppingCart.orderSummary(),
  { scrub: [/order-\d+/g, /\d{4}-\d{2}-\d{2}/g] }
)
```

**Approval storage:**

```
tests/
  approvals/
    shopping-cart/
      order-summary-format.browser.approved.txt
      order-summary-format.api.approved.json
```

**AI agent integration**: Approvals are a natural human-in-the-loop gate. The agent cannot auto-approve changes to output shape. The developer maintains control over what the system produces.

```
Agent implements code
  → Tests run
  → Approval output changes (received ≠ approved)
  → Diff presented to DEVELOPER (not agent)
  → Developer approves: new baseline saved, agent continues
  → Developer rejects: agent iterates on implementation
```

## Reporting: Two Consumers

| Consumer | Format | Purpose |
|----------|--------|---------|
| CI/CD pipeline | JUnit XML, HTML | Standard integration, human-readable reports |
| AI agent (MCP) | Compact JSON, progressive disclosure | Context-efficient, actionable |

## MCP Server (Phase 2)

The MCP server provides an AI-friendly interface to the test suite. It is NOT the execution engine. Tests run normally via vitest. The MCP server observes, reports, and enables AI interaction.

### Tools

**Test Execution:**
- `run_suite(adapter?, filter?)` - Run tests, return compact results
- `run_test(test_id, adapter?)` - Run single test
- `get_results(context_budget?)` - Results with progressive disclosure (minimal / standard / full)

**Domain Exploration:**
- `list_domains()` - Available domains and their adapters
- `describe_domain(name)` - Actions, assertions, adapter support
- `execute_action(domain, action, args, adapter)` - Run action outside a test (exploration/debugging)

**Observation (adapter-aware):**
- `observe(adapter)` - Browser: screenshot/DOM snapshot. API: last request/response. Code: current state.

**Analysis:**
- `get_failure(test_id)` - Single failure detail
- `get_trace(test_id)` - Action-by-action execution trace in domain language
- `audit_coverage(domain?)` - What's tested vs what's not
- `suggest_test(intent)` - Generate test in the domain DSL

**Approvals:**
- `list_pending_approvals()` - Approvals awaiting human review
- `get_approval_diff(test_id)` - Context-efficient received vs approved diff
- `approve(test_id)` - Developer approves new baseline
- `reject(test_id, reason?)` - Developer rejects, reason fed back to agent

### Context Management

- Results are structured and compact by default
- Progressive disclosure: summary first, drill into details on demand
- Action traces use domain language, not raw selectors/HTTP
- No XML/HTML dumped into context

## Agent Skill: Predictive TDD (Phase 3)

A Claude Code / Amp skill for AI-assisted development where the developer remains the architect.

### Core Workflow

Adapted from Ted Young's Predictive TDD. The agent must **predict** test outcomes before running them, serving as a self-diagnostic for system understanding.

```
Developer (Architect)              Agent (Implementer)
    |                                  |
    |── Define domain DSL ────────────>|
    |── Write acceptance test ────────>|
    |                                  |
    |                             RED: Predict failure, run, verify prediction
    |                             GREEN: Write minimal code, predict pass, run
    |                             APPROVAL: Present diffs to developer
    |<── Review approval diff ────────|
    |── Approve / reject ────────────>|
    |                             REFACTOR: Improve code, re-run
    |<── Review & approve ───────────|
```

### Testing Techniques

- **Predictive TDD**: Agent predicts how and why a test will fail before running it
- **ZOMBIES checklist**: Zero/empty, One, Many, Boundary, Interface, Exception, Simple
- **Approval workflow**: Agent cannot proceed until developer approves or rejects
- **Nullables**: Infrastructure wrappers with `create()` / `createNull()` for testing without mocks

## Planned Adapters

| Adapter | Protocol | Phase |
|---------|----------|-------|
| Playwright | Browser (UI) | Cupcake |
| fetch/HTTP | REST API | Phase 1 |
| Direct call | Code (unit-level) | Phase 1 |
| Cypress | Browser (alt) | Future |
| GraphQL | API (alt) | Future |

## Development Cycle Integration

```
Local dev (fast):    code adapter → API adapter → browser adapter
PR/CI (thorough):    all adapters in parallel → JUnit reports
Staging/CD (gate):   browser + API against deployed env
Monitoring (prod):   subset of browser tests on cron
```

## Phases

### Cupcake (Weeks 1-4)
- `defineDomain()`, `action()`, `assertion()`, `approval()`
- `implement()` with Playwright adapter
- `domainWith()` convenience helper
- Vitest integration
- One example domain (e-commerce cart)
- README that reads like a landing page

### Phase 1: Core Framework (Weeks 1-6)
- HTTP adapter (fetch)
- Direct-call adapter (code)
- `aver run` CLI wrapping Vitest
- `aver init` scaffolding
- Basic CI reporter (JUnit XML)
- Approval testing workflow (received/approved/diff/scrubbers)
- Docs site + examples

### Phase 2: AI-Native (Weeks 7-12)
- MCP server (the differentiator)
- Context-budget-aware reporting
- Domain exploration tools
- Progressive disclosure for AI agents

### Phase 3: Agent Skill (Weeks 13+)
- Predictive TDD workflow skill
- ZOMBIES test planning
- Approval gate workflow
- Reference docs

### Phase 4: Blueprint Integration (Future, if earned)
- Blueprint generates Domain objects
- VS Code extension for spec authoring
- Cross-reference validation between specs and domains

## Open Questions

- **Protocol driver binding at runtime**: How does a test file resolve which `implement()` to use? Vitest fixtures? Aver config file? CLI flag? Some combination?
- **File conventions**: Where do domains, adapters, and specs live by convention?
- **Domain composition**: Should domains support inheritance or composition for shared concepts?
- **Multi-adapter setup/teardown**: How do adapter-specific lifecycle hooks work?
- **Error reporting**: Domain-level language ("ShoppingCart.hasTotal expected $19.98, got $15.00") vs raw adapter errors?
- **License**: MIT? Apache 2.0?

## Influences

- **Dave Farley** -- 4-layer acceptance test architecture (Continuous Delivery)
- **Ted Young** -- Predictive TDD
- **Serenity/JS** -- Screenplay pattern, domain abstraction for testing
- **Playwright** -- Distribution model (library + runner), adapter architecture
- **Vitest / tRPC / Zod** -- API style (functions + type inference, no classes)
- **Approvals.NodeJS** -- Approval testing workflow
- **Vibium** -- Context-budget-aware MCP reporting
