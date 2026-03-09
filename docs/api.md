---
layout: default
title: API Reference
nav_order: 7
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
    cartTotal: query<number>(),
  },
  assertions: {
    hasItems: assertion<{ count: number }>(),
  },
})
```

**Returns:** `Domain` — a domain object with vocabulary metadata and an `extend()` method.

### `action<Payload>(opts?)`

Creates an action marker. Actions perform side effects and return void.

```typescript
addItem: action<{ name: string }>()  // typed payload
checkout: action()                    // no payload (void)
addItem: action<{ name: string }>({  // with telemetry declaration
  telemetry: (p) => ({ span: 'cart.add-item', attributes: { 'item.name': p.name } }),
})
```

**Options:** `MarkerOptions<P>` — optional object with a `telemetry: TelemetryDeclaration<P>` property.

### `query<Return>(opts?)` / `query<Payload, Return>(opts?)`

Creates a query marker. Queries read data and return a typed result. Two overloads:

```typescript
cartTotal: query<number>()                          // no input, returns number
tasksByStatus: query<{ status: string }, Task[]>()  // input + return type
cartTotal: query<number>({                          // with telemetry
  telemetry: { span: 'cart.total' },
})
```

### `assertion<Payload>(opts?)`

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

### `playwright(options?)` <small>from `@aver/protocol-playwright`</small>

Playwright protocol providing a browser page.

```typescript
import { playwright } from '@aver/protocol-playwright'

protocol: playwright()
```

Context is a Playwright `Page`. Browser is launched once and reused; a fresh page is created per test.

### `withFixture(protocol, fixture)`

Wraps a protocol with before/after hooks.

```typescript
import { withFixture } from '@aver/core'

const wrapped = withFixture(myProtocol, {
  before: async () => { /* runs before setup */ },
  after: async () => { /* runs after teardown */ },
})
```

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
  const entries = trace()  // trace is a function
})
```

The callback receives a `TestContext`:

| Property | Type | Description |
|:---------|:-----|:------------|
| `act` | `ActProxy<D>` | Typed proxy for actions |
| `given` | `ActProxy<D>` | Alias for `act` — setup steps (Given-When-Then) |
| `when` | `ActProxy<D>` | Alias for `act` — trigger steps (Given-When-Then) |
| `query` | `QueryProxy<D>` | Typed proxy for queries |
| `assert` | `AssertProxy<D>` | Typed proxy for assertions |
| `then` | `AssertProxy<D>` | Alias for `assert` — verification steps (Given-When-Then) |
| `trace` | `() => TraceEntry[]` | Returns the current action trace (callable) |

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
  testDir: './tests',  // optional, defaults to './tests/acceptance'
})
```

**`AverConfigInput`:**

| Property | Type | Default | Description |
|:---------|:-----|:--------|:------------|
| `adapters` | `Adapter[]` | *required* | Adapters to register |
| `testDir` | `string` | `'./tests/acceptance'` | Test directory |
| `coverage` | `{ minPercentage?: number }` | `{ minPercentage: 0 }` | Vocabulary coverage threshold |
| `teardownFailureMode` | `'fail' \| 'warn'` | `'fail'` | Whether teardown errors fail the test |

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

### `getRegistrySnapshot()` / `restoreRegistrySnapshot(snapshot)`

Capture and restore registry state. Useful for test isolation.

### `withRegistry(fn)`

Runs a function with an isolated registry that resets afterward.

---

## Telemetry

### `TelemetryCollector`

Interface for providing spans to the framework. Set on `Protocol.telemetry`.

```typescript
interface TelemetryCollector {
  getSpans(): CollectedSpan[]
  reset(): void
}
```

### `CollectedSpan`

Span data for telemetry verification.

```typescript
interface CollectedSpan {
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId?: string
  readonly name: string
  readonly attributes: Readonly<Record<string, unknown>>
  readonly links?: ReadonlyArray<SpanLink>
}

interface SpanLink {
  readonly traceId: string
  readonly spanId: string
}
```

### `createOtlpReceiver()`

Creates an OTLP HTTP receiver for cross-process telemetry testing.

```typescript
import { createOtlpReceiver } from '@aver/core'

const receiver = await createOtlpReceiver()
// receiver.port — port the OTLP HTTP endpoint listens on
// receiver.getSpans() — returns CollectedSpan[]
// receiver.reset() — clears collected spans
// receiver.close() — shuts down the server
```

The receiver implements `TelemetryCollector` so it can be set directly on a protocol's `telemetry` property.

### `verifyCorrelation(trace, spans)`

Verifies that correlated trace entries have causally connected spans.

```typescript
import { verifyCorrelation } from '@aver/core'
```

### Telemetry Declarations

Declared on domain markers via the `telemetry` option:

```typescript
// Static — fixed span name and attributes
action({ telemetry: { span: 'order.checkout' } })

// Parameterized — attributes derived from payload
action<{ orderId: string }>({
  telemetry: (p) => ({
    span: 'order.checkout',
    attributes: { 'order.id': p.orderId },
  }),
})
```

**`TelemetryExpectation`:**

| Property | Type | Description |
|:---------|:-----|:------------|
| `span` | `string` | OTel span name to match |
| `attributes` | `Record<string, TelemetryAttributeValue>` | Required span attributes. Primitives for exact match, or asymmetric matchers (e.g. `expect.any(String)`) |

### `AVER_TELEMETRY_MODE`

Environment variable controlling telemetry verification:

| Value | Behavior | Default when |
|:------|:---------|:-------------|
| `fail` | Missing/mismatched spans fail the test | `CI` is set |
| `warn` | Mismatches recorded but tests pass | `CI` is not set |
| `off` | No telemetry verification | — |

---

## Test Context

### `getTestContext()`

Returns the current test context from async-local storage, or `undefined` if not in a test.

### `runWithTestContext(context, fn)`

Runs a function within a test context (for framework-level use).

---

## Registry Lifecycle

### How Adapters Are Registered

`defineConfig({ adapters })` calls `registerAdapter()` for each adapter when the config module is evaluated. This is the standard path — your `aver.config.ts` runs once and registers all adapters for the process.

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
  // Domain & markers
  Domain,
  ActionMarker,
  QueryMarker,
  AssertionMarker,
  MarkerOptions,
  TelemetryExpectation,
  TelemetryDeclaration,
  TelemetryAttributeValue,
  AsymmetricMatcher,

  // Adapters & protocols
  Adapter,
  Protocol,
  TestMetadata,
  TestCompletion,
  ProtocolExtensions,
  Screenshotter,

  // Telemetry
  TelemetryCollector,
  CollectedSpan,
  SpanLink,
  TelemetryMatchResult,
  OtlpReceiver,
  CorrelationResult,
  CorrelationGroup,
  CorrelationViolation,

  // Suite & testing
  TestContext,
  SuiteReturn,
  ActProxy,
  QueryProxy,
  AssertProxy,
  PlannedTest,
  RunningTestContext,

  // Config
  AverConfig,
  AverConfigInput,
  CoverageConfig,
  TeardownFailureMode,

  // Trace
  TraceEntry,
  TraceAttachment,
  VocabularyCoverage,

  // Registry
  RegistrySnapshot,
} from '@aver/core'
```

### `TraceEntry`

```typescript
interface TraceEntry {
  kind: 'action' | 'query' | 'assertion' | 'test'
  category?: 'given' | 'when' | 'act' | 'query' | 'then' | 'assert'
  name: string
  domainName?: string
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
  telemetry?: TelemetryMatchResult
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
  telemetry?: TelemetryCollector
}
```

The lifecycle hooks are optional. `onTestStart` runs before each test body. `onTestFail` runs when a test fails and can return `TraceAttachment[]` (e.g., screenshots). `onTestEnd` runs after each test regardless of outcome.

---

## Approval Testing <small>from `@aver/approvals`</small>

### `approve(value, options?)`

Approves a value against a stored baseline. Auto-detects serializer: objects use JSON, strings use text. Also exported as `characterize` for characterization test contexts.

```typescript
import { approve } from '@aver/approvals'
// or: import { characterize } from '@aver/approvals'

await approve({ count: 42 })                    // default name "approval"
await approve(reportText, { name: 'report' })   // named approval
```

First run fails with "Baseline missing". Run `AVER_APPROVE=1 npx vitest run` or `npx aver approve` to create baselines.

Baselines are stored in `__approvals__/<test-name>/` next to the test file. Commit `.approved` files; gitignore `.received` and `.diff` files.

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

Approves a screenshot against a stored baseline image. Requires a protocol with `screenshotter` extension (e.g., Playwright). Throws an error on protocols without one.

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

### `Screenshotter` <small>from `@aver/core`</small>

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

Interactive scaffolding wizard. Prompts for domain name and protocol, then generates:
- `domains/<kebab>.ts`
- `adapters/<kebab>.<protocol>.ts`
- `tests/<kebab>.spec.ts`
- `aver.config.ts` (if it doesn't exist)

```bash
npx aver init
```

### `aver approve`

Updates approval baselines by running tests with `AVER_APPROVE=1`.

```bash
npx aver approve                               # approve all
npx aver approve tests/my-test.spec.ts         # approve specific file
npx aver approve --adapter playwright          # approve for specific adapter
```
