# Aver: Full Pre-Release Roadmap

**Date**: 2026-02-09

## Context
Aver has shipped its MVP (core + MCP server, 85 tests passing) but needs polish, missing features, documentation, and a real-world example before publishing. No external users yet — this is the window to get the API right and create a compelling first impression.

---

## Phase 1: DX Review — API Polish

Fix rough edges found in the dogfood audit. Do this first because everything else builds on the API.

### 1A. Clean up registry exports
Rename underscore-prefixed exports to proper public names:
- `_registerAdapter` → `registerAdapter`
- `_findAdapter` → `findAdapter`
- `_getAdapters` → `getAdapters`
- `_resetRegistry` → `resetRegistry`

Add `findAdapters(domain)` — returns ALL matching adapters (not just first). Needed for multi-adapter support.

**Files:** `packages/aver/src/core/registry.ts`, `packages/aver/src/index.ts`, all MCP server files that import registry functions

### 1B. Rework `suite()` API — callback style with multi-adapter

Replace the current `Suite` interface with a cleaner API:

```typescript
// Single adapter (explicit)
const { test } = suite(cartDomain, directAdapter)

// Multi adapter (via registry/config)
const { test } = suite(cartDomain)

// Test code is identical either way — domain comes via callback
test('add item to cart', async ({ domain, trace }) => {
  await domain.addItem({ name: 'Widget', qty: 1 })
  await domain.cartHasItems({ count: 1 })
})
```

**How it works:**
- `suite(domain, adapter?)` — adapter optional; without it, resolves from registry
- Multi-adapter: wraps tests in `describe("[protocol-name]")` blocks, one per adapter
- `test(name, fn)` — wraps Vitest `test()`, passes `{ domain, trace }` via callback
- Setup/teardown handled automatically via `beforeEach`/`afterEach` (no user boilerplate)
- On failure: action trace appended to error message (absorbs unused `suite.test()` feature)
- `--adapter` flag / `AVER_ADAPTER` env var filters which adapters run

**Removes:** `Suite` interface, `suite.test()`, `_setupForTest()`, `_teardownForTest()`, `_getTrace()`

**Files:** `packages/aver/src/core/suite.ts` (rewrite), `packages/aver/src/index.ts`

### 1C. Wire up `defineConfig` to auto-register adapters

`defineConfig()` calls `registerAdapter()` for each adapter. Makes `aver.config.ts` the canonical registration point:

```typescript
// aver.config.ts
export default defineConfig({
  adapters: [cartDirectAdapter, cartPlaywrightAdapter]
})
```

**Files:** `packages/aver/src/core/config.ts`

### 1D. Improve error messages

Missing adapter → list registered adapters + hint about `suite()` and `defineConfig()`.

**Files:** `packages/aver/src/core/suite.ts`

### 1E. Improve trace formatting

`[PASS]`/`[FAIL]` instead of Unicode ✓/✗. Truncate long payloads. Include error message on failures.

**Files:** `packages/aver/src/core/suite.ts`

### 1F. Migrate all tests to new API

Update 8 acceptance test files (4 core + 4 MCP server) + unit tests referencing old API. Target: zero `_`-prefixed imports, zero manual `beforeEach`/`afterEach` for registry/setup.

---

## Phase 2: Finish Features

### 2A. HTTP Protocol (`@aver/protocol-http`)

New package: `packages/protocol-http`

```typescript
import { http } from '@aver/protocol-http'

const adapter = implement(cartDomain, {
  protocol: http({ baseUrl: 'http://localhost:3000' }),
  actions: {
    addItem: async (ctx, { name, qty }) => {
      await ctx.post('/cart/items', { name, qty })
    },
  },
  queries: {
    cartTotal: async (ctx) => {
      const res = await ctx.get('/cart/total')
      return res.json()
    },
  },
  // ...
})
```

**Context type:** Object with typed HTTP helpers (`get`, `post`, `put`, `delete`, `patch`) wrapping native `fetch`. Base URL pre-configured.

**Structure mirrors `protocol-playwright`:**
- `packages/protocol-http/package.json` — peer deps: `aver`
- `packages/protocol-http/src/index.ts` — `http()` function returning `Protocol<HttpContext>`
- `packages/protocol-http/tsup.config.ts` — dual ESM/CJS + DTS
- `packages/protocol-http/test/` — unit tests

### 2B. `aver init` Scaffolding

Implement the placeholder in `packages/aver/src/cli/index.ts`.

```bash
aver init --domain ShoppingCart --protocol direct
# Creates:
#   domains/shopping-cart.ts       (domain definition)
#   adapters/shopping-cart.direct.ts (adapter skeleton)
#   tests/shopping-cart.spec.ts    (test file with suite setup)
#   aver.config.ts                 (if doesn't exist)
```

Generates minimal, working code that passes on first run. Templates use the new suite API.

**Files:** `packages/aver/src/cli/init.ts` (new), `packages/aver/src/cli/index.ts` (wire up)

### 2C. CI Reporter (JUnit XML)

Vitest reporter plugin that outputs JUnit XML with domain-language test names and action traces in failure output.

```typescript
// vitest.config.ts
import { averReporter } from 'aver/reporter'

export default defineConfig({
  test: {
    reporters: [averReporter({ output: 'test-results.xml' })]
  }
})
```

**Files:** `packages/aver/src/reporter/junit.ts` (new), export from `aver/reporter` subpath

---

## Phase 3: Real-World Example

### 3A. E-Commerce Example Domain

`examples/e-commerce/` — standalone project demonstrating Aver end-to-end.

**Domain vocabulary:**
- Actions: `addItemToCart`, `removeItemFromCart`, `setQuantity`, `applyCoupon`, `checkout`
- Queries: `cartItems`, `cartTotal`, `orderStatus`
- Assertions: `cartHasItems`, `cartTotalEquals`, `orderConfirmed`

**Adapters:**
- `direct` — in-memory cart/order objects (unit-speed)
- `playwright` — browser UI against a small Express app
- `http` — API calls against the same Express app

**Demonstrates:**
- Same test, three adapters (the "aha moment")
- Domain extensions (e.g., extend base cart domain with loyalty points)
- Action traces on failure
- `aver.config.ts` with multi-adapter registration
- MCP server exploring the domain (`list_domains`, `get_domain_vocabulary`)
- `aver run --adapter direct` vs `aver run --adapter playwright`

**Structure:**
```
examples/e-commerce/
  package.json
  aver.config.ts
  src/                    # Tiny Express app (API + UI)
  domains/
    shopping-cart.ts
  adapters/
    shopping-cart.direct.ts
    shopping-cart.playwright.ts
    shopping-cart.http.ts
  tests/
    shopping-cart.spec.ts
```

---

## Phase 4: Documentation + Blog (GitHub Pages / Jekyll)

Jekyll via `docs/` folder. GitHub Pages serves from `docs/` on main branch. Uses `just-the-docs` theme.

### 4A. Jekyll Setup

```
docs/
  _config.yml             # Theme, title, navigation
  index.md                # Landing page
  getting-started.md      # Tutorial (Diataxis)
  architecture.md         # Explanation (Diataxis)
  api.md                  # Reference (Diataxis)
  guides/
    multi-adapter.md      # How-to (Diataxis)
    mcp-server.md         # How-to (Diataxis)
    ci-integration.md     # How-to (Diataxis)
  blog/
    _posts/
      2026-XX-XX-introducing-aver.md
```

### 4B. Diataxis Structure

**Tutorial — Getting Started** (`getting-started.md`)
Step-by-step: install → define domain → create adapter → write test → run. Uses the e-commerce example. Goal: working test in 10 minutes.

**Explanation — Architecture** (`architecture.md`)
The 3-layer model: domains (what), adapters (how), tests (verify). Why domain abstraction matters. Protocol-agnostic testing. The registry/config model. Dave Farley's 4-layer architecture influence.

**Reference — API** (`api.md`)
Every public export documented: `action()`, `query()`, `assertion()`, `defineDomain()`, `.extend()`, `implement()`, `suite()`, `defineConfig()`, `direct()`, `registerAdapter()`, `findAdapter()`. Protocol interface. Adapter interface. TraceEntry type.

**How-To Guides** (`guides/`)
- Multi-adapter testing: same domain, different protocols
- MCP server setup: Claude Code / Cursor integration
- CI integration: JUnit reporter + pipeline config

### 4C. Blog Post — "Introducing Aver"

`docs/blog/_posts/2026-XX-XX-introducing-aver.md`

**Thesis:**
- AI writes code faster than we can verify it
- Implementation-coupled tests (raw Playwright, unit tests) break when AI refactors
- Domain-abstracted tests verify business intent, not implementation
- Aver: define WHAT to test in domain language, swap HOW via adapters
- Same test runs against in-memory, browser, and API — zero code duplication
- Before/after comparison showing the maintenance cost difference

### 4D. LICENSE + READMEs

- `/LICENSE` — MIT (already declared in package.json files)
- `/README.md` — landing page style: tagline, problem, 3-layer diagram, code example, before/after, quick start, package table
- `packages/aver/README.md` — short, points to main docs
- `packages/protocol-playwright/README.md` — short, points to main docs
- `packages/protocol-http/README.md` — short, points to main docs
- `packages/mcp-server/README.md` — short, points to main docs
- `.gitignore` — add `docs/_site/` for local Jekyll builds

---

## Phase 5: Post-MVP Planning (Not Built Now)

Notes for future work after initial release:

- **Approval testing** — `approve()` utility, baseline storage, `aver approve` CLI, MCP tools
- **Claude Code skill** — Predictive TDD workflow, ZOMBIES checklist, approval gates
- **Blueprint integration** — spec language → domain code generation (only if users ask for it)
- **Additional protocols** — WebSocket, gRPC
- **Advanced MCP** — `suggest_test()`, `audit_coverage()`, context-budget-aware reporting

---

## Implementation Order Summary

| Step | Phase | What | Est. Scope |
|------|-------|------|------------|
| 1 | 1A | Rename registry exports | Small — find/replace |
| 2 | 1B | Rework `suite()` API | Large — core rewrite |
| 3 | 1C | Wire up `defineConfig` | Small |
| 4 | 1D-E | Error messages + trace formatting | Small |
| 5 | 1F | Migrate all tests | Medium — 8+ files |
| 6 | 2A | HTTP protocol package | Medium — new package |
| 7 | 2B | `aver init` scaffolding | Medium |
| 8 | 2C | CI reporter (JUnit XML) | Medium |
| 9 | 3A | E-commerce example | Large — app + 3 adapters |
| 10 | 4D | LICENSE + README + package READMEs | Medium |
| 11 | 4A-B | Jekyll docs site + Diataxis pages | Large |
| 12 | 4C | Blog post | Medium |

## Verification

**After Phase 1:**
- All tests green, zero `_`-prefixed imports in test files
- Multi-adapter describe blocks verified manually

**After Phase 2:**
- HTTP protocol tests pass
- `aver init` generates working scaffold
- JUnit XML output verified against CI schema

**After Phase 3:**
- Example runs: `aver run` in `examples/e-commerce/` with all 3 adapters

**After Phase 4:**
- Jekyll builds locally: `cd docs && bundle exec jekyll serve`
- All pages render correctly
- Blog post reads well standalone
