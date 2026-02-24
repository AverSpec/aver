---
layout: default
title: API Reference
nav_order: 4
---

# API Reference

All public exports from the `@aver/core` package.

## Domain Definition

### `defineDomain(config)`

Creates a domain with a named vocabulary.

```typescript
import { defineDomain, action, query, assertion } from '@aver/core'

const cart = defineDomain({
  name: 'shopping-cart',
  actions: {
    addItem: action<{ name: string; qty: number }>(),
  },
  queries: {
    cartTotal: query<void, number>(),
  },
  assertions: {
    hasItems: assertion<{ count: number }>(),
  },
})
```

**Returns:** `Domain` — a domain object with vocabulary metadata and an `extend()` method.

### `action<Payload>()`

Creates an action marker. Actions perform side effects and return void.

```typescript
addItem: action<{ name: string }>()  // typed payload
checkout: action()                    // no payload
```

### `query<Payload, Return>()`

Creates a query marker. Queries read data and return a typed result.

```typescript
cartTotal: query<void, number>()                       // no input, returns number
tasksByStatus: query<{ status: string }, Task[]>()     // input + return type
```

### `assertion<Payload>()`

Creates an assertion marker. Assertions verify expectations and throw on failure.

```typescript
hasItems: assertion<{ count: number }>()  // typed payload
isEmpty: assertion()                       // no payload
```

### `domain.extend(name, config)`

Extends a domain with additional vocabulary. The extended domain inherits all items from the parent. The name is passed as the first argument.

```typescript
const cartUI = cart.extend('shopping-cart-ui', {
  assertions: {
    showsSpinner: assertion(),
  },
})
```

---

## Adapters

### `implement(domain, config)`

Creates an adapter binding a domain to a protocol with handler implementations.

```typescript
import { implement, unit } from '@aver/core'

const adapter = implement(cart, {
  protocol: unit(() => []),
  actions: {
    addItem: async (ctx, payload) => { /* ... */ },
  },
  queries: {
    cartTotal: async (ctx) => { /* ... */ },
  },
  assertions: {
    hasItems: async (ctx, payload) => { /* ... */ },
  },
})
```

TypeScript enforces that every action, query, and assertion declared in the domain is provided. Missing handlers are compile errors.

**Returns:** `Adapter` — an adapter object with domain, protocol, and handler references.

---

## Protocols

### `unit(factory)`

Built-in protocol for in-memory testing. Zero dependencies.

```typescript
import { unit } from '@aver/core'

protocol: unit(() => new Cart())         // object context
protocol: unit(() => ({ db: new DB() })) // compound context
protocol: unit<Cart[]>(() => [])         // typed context
```

The factory runs on each test setup, creating a fresh context. Teardown is a no-op.

### `http(options)` <small>from `@aver/protocol-http`</small>

HTTP protocol providing a fetch-based client.

```typescript
import { http } from '@aver/protocol-http'

protocol: http({ baseUrl: 'http://localhost:3000' })
```

Context provides `get`, `post`, `put`, `patch`, `delete` methods.

### `playwright(options)` <small>from `@aver/protocol-playwright`</small>

Playwright protocol providing a browser page.

```typescript
import { playwright } from '@aver/protocol-playwright'

protocol: playwright()
```

Context is a Playwright `Page`. Browser is launched once and reused; a fresh page is created per test.

---

## Suite

### `suite(domain, adapter?)`

Creates a test suite for a domain.

```typescript
import { suite } from '@aver/core'

// Multi-adapter: resolves from registry
const { test } = suite(cart)

// Single adapter: passed directly
const { test } = suite(cart, unitAdapter)
```

**Returns:** `SuiteReturn` with the following:

| Property | Type | Description |
|:---------|:-----|:------------|
| `test` | `(name, fn) => void` | Wraps Vitest's `test()` with domain proxies |
| `it` | `(name, fn) => void` | Alias for `test` |
| `describe` | `(name, fn) => void` | Wraps Vitest's `describe()` for grouping |
| `context` | `(name, fn) => void` | Alias for `describe` |
| `act` | `ActProxy` | Programmatic access to actions |
| `query` | `QueryProxy` | Programmatic access to queries |
| `assert` | `AssertProxy` | Programmatic access to assertions |
| `setup` | `() => Promise<void>` | Manual setup (for programmatic use) |
| `teardown` | `() => Promise<void>` | Manual teardown (for programmatic use) |
| `getTrace` | `() => TraceEntry[]` | Get the current action trace |
| `getCoverage` | `() => VocabularyCoverage` | Get vocabulary coverage stats |
| `getPlannedTests` | `(name) => PlannedTest[]` | Preview what test names would be registered |

### `test(name, fn)`

Wraps Vitest's `test()`, passing typed domain proxies via callback:

```typescript
test('add item', async ({ given, when, query, assert, trace }) => {
  await given.addItem({ name: 'Widget' })
  await when.checkout()
  await assert.hasItems({ count: 1 })
  const total = await query.cartTotal()
})
```

The callback receives:

| Property | Description |
|:---------|:------------|
| `act` | Typed proxy for actions |
| `given` | Alias for `act` — narrative clarity for setup steps (Given-When-Then) |
| `when` | Alias for `act` — narrative clarity for trigger steps (Given-When-Then) |
| `query` | Typed proxy for queries |
| `assert` | Typed proxy for assertions |
| `trace` | Current action trace array |

---

## Configuration

### `defineConfig(config)`

Creates an Aver configuration and auto-registers adapters.

```typescript
import { defineConfig } from '@aver/core'
import { unitAdapter } from './adapters/cart.unit'
import { httpAdapter } from './adapters/cart.http'

export default defineConfig({
  adapters: [unitAdapter, httpAdapter],
  testDir: './tests',  // optional, defaults to '.'
})
```

### `registerAdapter(adapter)`

Manually registers an adapter in the global registry.

### `findAdapter(domain)`

Returns the first registered adapter matching a domain, or `undefined`.

### `findAdapters(domain)`

Returns all registered adapters matching a domain.

### `getAdapters()`

Returns all registered adapters.

### `resetRegistry()`

Clears all registered adapters. Useful in test setup.

---

## Registry Lifecycle

### How Adapters Are Registered

`defineConfig({ adapters })` calls `registerAdapter()` for each adapter when the config module is evaluated. This is the standard path — your `aver.config.ts` runs once and registers all adapters for the process.

```typescript
// aver.config.ts
import { defineConfig } from '@aver/core'
import { unitAdapter } from './adapters/cart.unit'
import { httpAdapter } from './adapters/cart.http'

export default defineConfig({
  adapters: [unitAdapter, httpAdapter],
})
```

You can also call `registerAdapter()` directly in test files or setup files.

### When Adapters Are Resolved

`suite(domain)` resolves adapters lazily — at test execution time, not when `suite()` is called. On first invocation, `suite()` calls `maybeAutoloadConfig()` to import `aver.config.ts` if it hasn't been loaded yet. Set `AVER_AUTOLOAD_CONFIG=false` to skip this.

Passing an adapter directly — `suite(domain, adapter)` — bypasses the registry entirely.

### Environment Filtering

Two environment variables control which tests run:

- `AVER_ADAPTER=unit` — only run tests for adapters whose protocol name matches
- `AVER_DOMAIN=ShoppingCart` — only register tests for the named domain

These map to the CLI flags `aver run --adapter unit` and `aver run --domain ShoppingCart`.

### Multi-Adapter Dispatch

When multiple adapters are registered for one domain, `suite()` creates a parameterized test for each:

```
add item [unit]     ← runs against unit adapter
add item [http]     ← runs against http adapter
```

Each adapter gets its own protocol context (fresh `setup()` / `teardown()` per test per adapter).

### Parent Chain Resolution

If no adapter is registered for a domain, `findAdapter()` walks the `domain.parent` chain. This means an adapter registered for a parent domain works for extended domains that haven't overridden it.

### Test Isolation

The registry is process-global state. If your tests register their own adapters (common in framework-level testing), call `resetRegistry()` in `beforeEach` to prevent cross-test leakage:

```typescript
import { resetRegistry, registerAdapter } from '@aver/core'

beforeEach(() => {
  resetRegistry()
  registerAdapter(myTestAdapter)
})
```

---

## Types

```typescript
import type {
  Domain,
  Adapter,
  Protocol,
  AverConfig,
  TraceEntry,
  ActProxy,
  QueryProxy,
  AssertProxy,
  TestContext,
  SuiteReturn,
  ActionMarker,
  QueryMarker,
  AssertionMarker,
} from '@aver/core'
```

### `TraceEntry`

```typescript
interface TraceEntry {
  kind: 'action' | 'query' | 'assertion' | 'test'
  name: string
  payload: unknown
  status: 'pass' | 'fail'
  result?: unknown
  error?: unknown
  startAt?: number
  endAt?: number
  durationMs?: number
  attachments?: TraceAttachment[]
  metadata?: Record<string, unknown>
  correlationId?: string
}
```

### `Protocol<Context>`

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

The lifecycle hooks are optional. `onTestStart` runs before each test body. `onTestFail` runs when a test fails and can return `TraceAttachment[]` (e.g., screenshots). `onTestEnd` runs after each test regardless of outcome.

---

## Approval Testing <small>from `@aver/approvals`</small>

### `approve(value, options?)`

Approves a value against a stored baseline. Auto-detects serializer: objects use JSON, strings use text.

```typescript
import { approve } from '@aver/approvals'

await approve({ count: 42 })                    // default name "approval"
await approve(reportText, { name: 'report' })   // named approval
```

First run fails with "Baseline missing". Run `aver approve` to create it.

**Options:**

| Property | Type | Default | Description |
|:---------|:-----|:--------|:------------|
| `name` | `string` | `'approval'` | Name for the approval file |
| `fileExtension` | `string` | auto | Override file extension |
| `filePath` | `string` | auto | Override test file path (for programmatic use) |
| `testName` | `string` | auto | Override test name (for programmatic use) |
| `serializer` | `SerializerName` | auto | Serializer to use (`'json'`, `'text'`, or custom name) |
| `comparator` | `Comparator` | default | Custom comparison function `(approved, received) => { equal: boolean }` |

### `approve.visual(nameOrOptions)`

Approves a screenshot against a stored baseline image. Requires a protocol with `screenshotter` extension (e.g., Playwright). Skips with warning on protocols without one.

```typescript
await approve.visual('board-state')                          // full page
await approve.visual({ name: 'backlog', region: 'backlog' }) // scoped region
```

**Options (when passing object):**

| Property | Type | Required | Description |
|:---------|:-----|:---------|:------------|
| `name` | `string` | yes | Name for the approval image file |
| `region` | `string` | no | Named region (maps to CSS selector in adapter) |
| `threshold` | `number` | no | Pixel difference threshold (0-1) for visual comparison |

### `Screenshotter` <small>from `aver`</small>

Extension interface for visual approval support. Protocols implement this.

```typescript
interface Screenshotter {
  capture(outputPath: string, options?: { region?: string }): Promise<void>
  regions?: Record<string, string>
}
```

Playwright configures regions at adapter creation:

```typescript
const proto = playwright({
  regions: {
    'board': '.board',
    'backlog': '[data-testid="column-backlog"]',
  },
})
```

### Test Runner Integration

`approve()` integrates with test runners by throwing standard `Error`-based assertion errors when a baseline mismatch is detected. The test runner catches these errors and reports them as test failures.

- **Vitest and Jest** work out of the box — both catch thrown errors as assertion failures
- **Other test runners** need to support standard `Error`-based assertions (most do)
- Set the `AVER_APPROVE` environment variable to update baselines: `AVER_APPROVE=1` writes received values as the new baselines instead of comparing. The `aver approve` CLI command sets this automatically.

---

## CLI

### `aver run`

Runs tests via Vitest.

```bash
npx aver run                         # all tests
npx aver run --adapter unit          # filter by adapter
npx aver run --domain ShoppingCart   # filter by domain
npx aver run --watch                 # watch mode
```

### `aver init`

Scaffolds a new domain with adapter and test files.

```bash
npx aver init --domain ShoppingCart --protocol unit
```

Generates:
- `domains/shopping-cart.ts`
- `adapters/shopping-cart.unit.ts`
- `tests/shopping-cart.spec.ts`
- `aver.config.ts` (if it doesn't exist)

### `aver approve`

Updates approval baselines by running tests with `AVER_APPROVE=1`.

```bash
npx aver approve                               # approve all
npx aver approve tests/my-test.spec.ts         # approve specific file
npx aver approve --adapter playwright          # approve for specific adapter
```
