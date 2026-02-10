# `{ act, query, assert }` API Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `{ domain, trace }` test callback with `{ act, query, assert, trace }` — three verb-prefixed namespace proxies that make vocabulary kind explicit at every call site.

**Architecture:** Split the single flat `DomainProxy` into three typed proxies (`ActProxy`, `QueryProxy`, `AssertProxy`), one per vocabulary kind. Update `TestContext` and `SuiteReturn` interfaces. The proxy builder in `suite.ts` already loops over each vocabulary kind separately, so we're just splitting the output into three objects instead of merging into one.

**Tech Stack:** TypeScript 5.7+, Vitest

---

### Task 1: Add new proxy types and split `createProxy` into `createProxies`

**Files:**
- Modify: `packages/aver/src/core/suite.ts:14-34` (types) and `packages/aver/src/core/suite.ts:45-112` (createProxy)

**Step 1: Update the type definitions**

Replace `DomainProxy` and `TestContext` with the new split types. Keep `DomainProxy` as a deprecated alias temporarily (removed in Task 3).

In `packages/aver/src/core/suite.ts`, replace the type block (lines 14-34):

```typescript
export type ActProxy<D extends Domain> = {
  [K in keyof D['vocabulary']['actions']]:
    D['vocabulary']['actions'][K] extends { __payload?: infer P }
      ? [P] extends [void] ? () => Promise<void> : (payload: P) => Promise<void>
      : never
}

export type QueryProxy<D extends Domain> = {
  [K in keyof D['vocabulary']['queries']]:
    D['vocabulary']['queries'][K] extends { __return?: infer R }
      ? () => Promise<R>
      : never
}

export type AssertProxy<D extends Domain> = {
  [K in keyof D['vocabulary']['assertions']]:
    D['vocabulary']['assertions'][K] extends { __payload?: infer P }
      ? [P] extends [void] ? () => Promise<void> : (payload: P) => Promise<void>
      : never
}

export interface TestContext<D extends Domain> {
  act: ActProxy<D>
  query: QueryProxy<D>
  assert: AssertProxy<D>
  trace: () => TraceEntry[]
}
```

**Step 2: Replace `createProxy` with `createProxies`**

Replace the `createProxy` function (lines 45-112) with:

```typescript
interface Proxies<D extends Domain> {
  act: ActProxy<D>
  query: QueryProxy<D>
  assert: AssertProxy<D>
}

function createProxies<D extends Domain>(
  domain: D,
  getCtx: () => any,
  getAdapter: () => Adapter,
  trace: TraceEntry[],
): Proxies<D> {
  const act: any = {}
  const query: any = {}
  const assert: any = {}

  for (const name of Object.keys(domain.vocabulary.actions)) {
    act[name] = async (payload?: any) => {
      const a = getAdapter()
      const entry: TraceEntry = { kind: 'action', name, payload, status: 'pass' }
      try {
        if (payload !== undefined) {
          await (a.handlers.actions as any)[name](getCtx(), payload)
        } else {
          await (a.handlers.actions as any)[name](getCtx())
        }
      } catch (error) {
        entry.status = 'fail'
        entry.error = error
        throw error
      } finally {
        trace.push(entry)
      }
    }
  }

  for (const name of Object.keys(domain.vocabulary.queries)) {
    query[name] = async (payload?: any) => {
      const a = getAdapter()
      const entry: TraceEntry = { kind: 'query', name, payload, status: 'pass' }
      try {
        const result = payload !== undefined
          ? await (a.handlers.queries as any)[name](getCtx(), payload)
          : await (a.handlers.queries as any)[name](getCtx())
        entry.result = result
        return result
      } catch (error) {
        entry.status = 'fail'
        entry.error = error
        throw error
      } finally {
        trace.push(entry)
      }
    }
  }

  for (const name of Object.keys(domain.vocabulary.assertions)) {
    assert[name] = async (payload?: any) => {
      const a = getAdapter()
      const entry: TraceEntry = { kind: 'assertion', name, payload, status: 'pass' }
      try {
        if (payload !== undefined) {
          await (a.handlers.assertions as any)[name](getCtx(), payload)
        } else {
          await (a.handlers.assertions as any)[name](getCtx())
        }
      } catch (error) {
        entry.status = 'fail'
        entry.error = error
        throw error
      } finally {
        trace.push(entry)
      }
    }
  }

  return { act, query, assert }
}
```

Note: queries now accept an optional payload parameter to support `query<{ status: string }, Task[]>()` style queries with input.

**Step 3: Update `SuiteReturn` and `suite()` to use new proxies**

Replace the `SuiteReturn` interface:

```typescript
export interface SuiteReturn<D extends Domain> {
  test: (name: string, fn: (ctx: TestContext<D>) => Promise<void>) => void
  /** Programmatic API — for manual lifecycle control (meta-testing, adapter handlers). */
  act: ActProxy<D>
  query: QueryProxy<D>
  assert: AssertProxy<D>
  setup(): Promise<void>
  teardown(): Promise<void>
  getTrace(): TraceEntry[]
}
```

Update `suite()` function — replace `programmaticProxy` with `programmaticProxies`:

Where the current code has:
```typescript
const programmaticProxy = createProxy(...)
```
Replace with:
```typescript
const programmaticProxies = createProxies(...)
```

And update the return:
```typescript
return {
  test: testFn,
  act: programmaticProxies.act,
  query: programmaticProxies.query,
  assert: programmaticProxies.assert,
  setup: async () => { ... },
  teardown: async () => { ... },
  getTrace: () => [...programmaticTrace],
}
```

Update `runTestWithAdapter` — replace `proxy` with `proxies`:

Where it currently has:
```typescript
const proxy = createProxy(domain, () => ctx, () => adapter, trace)
// ...
await fn({ domain: proxy, trace: () => [...trace] })
```
Replace with:
```typescript
const proxies = createProxies(domain, () => ctx, () => adapter, trace)
// ...
await fn({ act: proxies.act, query: proxies.query, assert: proxies.assert, trace: () => [...trace] })
```

**Step 4: Update exports in index.ts**

In `packages/aver/src/index.ts`, replace:
```typescript
export type { TraceEntry, DomainProxy, TestContext, SuiteReturn } from './core/suite'
```
With:
```typescript
export type { TraceEntry, ActProxy, QueryProxy, AssertProxy, TestContext, SuiteReturn } from './core/suite'
```

**Step 5: Run tests to see them fail**

Run: `npm test -w packages/aver`
Expected: All tests that destructure `{ domain }` from the callback will fail with type/runtime errors.

**Step 6: Commit**

```bash
git add packages/aver/src/core/suite.ts packages/aver/src/index.ts
git commit -m "feat: split domain proxy into { act, query, assert } namespaces"
```

---

### Task 2: Migrate core unit tests

**Files:**
- Modify: `packages/aver/test/core/suite.spec.ts`

**Step 1: Update programmatic API tests**

Every reference to `s.domain.X()` needs to use the correct namespace:
- `s.domain.addItem(...)` → `s.act.addItem(...)`
- `s.domain.total()` → `s.query.total()`
- `s.domain.isEmpty()` → `s.assert.isEmpty()`
- `s.domain.check()` → `s.assert.check()`

Full updated test file:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { suite } from '../../src/core/suite'
import { resetRegistry, registerAdapter, getAdapters } from '../../src/core/registry'
import { implement } from '../../src/core/adapter'
import { defineDomain } from '../../src/core/domain'
import { action, query, assertion } from '../../src/core/markers'
import type { Protocol } from '../../src/core/protocol'

const calls: string[] = []

const testProtocol: Protocol<{ log: typeof calls }> = {
  name: 'test',
  async setup() {
    calls.length = 0
    return { log: calls }
  },
  async teardown() {
    calls.push('teardown')
  },
}

const cart = defineDomain({
  name: 'Cart',
  actions: {
    addItem: action<{ name: string }>(),
  },
  queries: {
    total: query<number>(),
  },
  assertions: {
    isEmpty: assertion(),
  },
})

const cartAdapter = implement(cart, {
  protocol: testProtocol,
  actions: {
    addItem: async (ctx, { name }) => { ctx.log.push(`add:${name}`) },
  },
  queries: {
    total: async () => 42,
  },
  assertions: {
    isEmpty: async () => {},
  },
})

describe('suite() — programmatic API', () => {
  beforeEach(() => {
    resetRegistry()
    calls.length = 0
  })

  it('dispatches actions through adapter', async () => {
    const s = suite(cart, cartAdapter)
    await s.setup()

    await s.act.addItem({ name: 'Widget' })
    expect(calls).toContain('add:Widget')

    await s.teardown()
  })

  it('dispatches queries through adapter', async () => {
    const s = suite(cart, cartAdapter)
    await s.setup()

    const total = await s.query.total()
    expect(total).toBe(42)

    await s.teardown()
  })

  it('dispatches assertions through adapter', async () => {
    const s = suite(cart, cartAdapter)
    await s.setup()

    await s.assert.isEmpty()

    await s.teardown()
  })

  it('records action trace', async () => {
    const s = suite(cart, cartAdapter)
    await s.setup()

    await s.act.addItem({ name: 'A' })
    await s.query.total()
    await s.assert.isEmpty()

    expect(s.getTrace()).toEqual([
      { kind: 'action', name: 'addItem', payload: { name: 'A' }, status: 'pass' },
      { kind: 'query', name: 'total', payload: undefined, status: 'pass', result: 42 },
      { kind: 'assertion', name: 'isEmpty', payload: undefined, status: 'pass' },
    ])

    await s.teardown()
  })

  it('records failure in trace', async () => {
    const failDomain = defineDomain({
      name: 'Fail',
      actions: {},
      queries: {},
      assertions: { check: assertion() },
    })
    const failAdapter = implement(failDomain, {
      protocol: testProtocol,
      actions: {},
      queries: {},
      assertions: { check: async () => { throw new Error('boom') } },
    })

    const s = suite(failDomain, failAdapter)
    await s.setup()

    await expect(s.assert.check()).rejects.toThrow('boom')

    const trace = s.getTrace()
    expect(trace[0]).toMatchObject({ kind: 'assertion', name: 'check', status: 'fail' })

    await s.teardown()
  })

  it('throws descriptive error when no adapter registered', async () => {
    const s = suite(cart)
    await expect(() => s.setup()).rejects.toThrow('No adapter registered for domain "Cart"')
  })

  it('resolves adapter from registry when not passed directly', async () => {
    registerAdapter(cartAdapter)
    const s = suite(cart)
    await s.setup()

    await s.act.addItem({ name: 'FromRegistry' })
    expect(calls).toContain('add:FromRegistry')

    await s.teardown()
  })
})

describe('suite().test() — callback API', () => {
  const { test: suiteTest } = suite(cart, cartAdapter)

  suiteTest('dispatches through callback domain proxy', async ({ act }) => {
    await act.addItem({ name: 'Callback' })
    // If this runs without error, setup/teardown and dispatch worked
  })

  suiteTest('provides trace in callback', async ({ act, query, trace }) => {
    await act.addItem({ name: 'Traced' })
    await query.total()
    const t = trace()
    expect(t).toHaveLength(2)
    expect(t[0]).toMatchObject({ kind: 'action', name: 'addItem', status: 'pass' })
    expect(t[1]).toMatchObject({ kind: 'query', name: 'total', status: 'pass' })
  })
})

describe('getAdapters()', () => {
  beforeEach(() => {
    resetRegistry()
  })

  it('returns empty array when no adapters registered', () => {
    expect(getAdapters()).toEqual([])
  })

  it('returns all registered adapters', () => {
    registerAdapter(cartAdapter)
    const adapters = getAdapters()
    expect(adapters).toHaveLength(1)
    expect(adapters[0].domain).toBe(cart)
  })

  it('returns a copy, not the internal array', () => {
    registerAdapter(cartAdapter)
    const a1 = getAdapters()
    const a2 = getAdapters()
    expect(a1).not.toBe(a2)
    expect(a1).toEqual(a2)
  })
})
```

**Step 2: Run tests**

Run: `npm test -w packages/aver -- --run test/core/suite.spec.ts`
Expected: All 10 tests pass.

**Step 3: Commit**

```bash
git add packages/aver/test/core/suite.spec.ts
git commit -m "test: migrate core suite tests to { act, query, assert } API"
```

---

### Task 3: Migrate core acceptance tests + dogfood adapter

**Files:**
- Modify: `packages/aver/test/acceptance/adapters/aver-core.direct.ts`
- Modify: `packages/aver/test/acceptance/domain-vocabulary.spec.ts`
- Modify: `packages/aver/test/acceptance/adapter-dispatch.spec.ts`
- Modify: `packages/aver/test/acceptance/action-trace.spec.ts`
- Modify: `packages/aver/test/acceptance/domain-extensions.spec.ts`

**Step 1: Update the dogfood adapter**

In `packages/aver/test/acceptance/adapters/aver-core.direct.ts`, the adapter uses `session.suiteInstance.domain` to dynamically dispatch. Update these references:

Replace `session.suiteInstance.domain` with the appropriate proxy:

- `executeAction` handler (line ~116): `(session.suiteInstance.domain as any)[name]` → `(session.suiteInstance.act as any)[name]`
- `executeQuery` handler (line ~123): `(session.suiteInstance.domain as any)[name]` → `(session.suiteInstance.query as any)[name]`
- `executeAssertion` handler (line ~131): `(session.suiteInstance.domain as any)[name]` → `(session.suiteInstance.assert as any)[name]`
- `executeFailingAssertion` handler (line ~145): `(session.suiteInstance.domain as any)[name]` → `(session.suiteInstance.assert as any)[name]`

Also update the `SuiteReturn` import if needed — the type should still work since `SuiteReturn` now has `act`, `query`, `assert` instead of `domain`.

**Step 2: Update all 4 acceptance test files**

All callbacks change from `{ domain }` to `{ act, assert }` (none of these test files use `query` or `trace` in the callback — they use domain assertions for checking).

In each file, replace `async ({ domain })` with `async ({ act, assert })`, then:
- `await domain.defineDomain(...)` → `await act.defineDomain(...)`
- `await domain.extendDomain(...)` → `await act.extendDomain(...)`
- `await domain.implementDomain()` → `await act.implementDomain()`
- `await domain.registerAdapter()` → `await act.registerAdapter()`
- `await domain.createSuite()` → `await act.createSuite()`
- `await domain.executeAction(...)` → `await act.executeAction(...)`
- `await domain.executeQuery(...)` → `await act.executeQuery(...)`
- `await domain.executeAssertion(...)` → `await act.executeAssertion(...)`
- `await domain.executeFailingAssertion(...)` → `await act.executeFailingAssertion(...)`
- `await domain.hasVocabulary(...)` → `await assert.hasVocabulary(...)`
- `await domain.adapterResolved()` → `await assert.adapterResolved()`
- `await domain.traceContains(...)` → `await assert.traceContains(...)`
- `await domain.traceHasLength(...)` → `await assert.traceHasLength(...)`
- `await domain.hasParent(...)` → `await assert.hasParent(...)`
- `await domain.queryReturned(...)` → `await assert.queryReturned(...)`

**Step 3: Run tests**

Run: `npm test -w packages/aver`
Expected: All 49 tests pass.

**Step 4: Commit**

```bash
git add packages/aver/test/
git commit -m "test: migrate core acceptance tests to { act, query, assert } API"
```

---

### Task 4: Migrate public API tests (index.spec.ts)

**Files:**
- Modify: `packages/aver/test/index.spec.ts`

**Step 1: Update the test file**

No callback API usage in this file — it tests `defineConfig`, `suite`, and exports. No changes needed to the test logic, but verify it still passes since `SuiteReturn` shape changed.

**Step 2: Run tests**

Run: `npm test -w packages/aver -- --run test/index.spec.ts`
Expected: All 4 tests pass (no callback usage in this file).

**Step 3: Commit (if changes needed)**

```bash
git add packages/aver/test/index.spec.ts
git commit -m "test: verify index exports with new API"
```

---

### Task 5: Build core package and migrate MCP server tests

**Files:**
- Modify: `packages/mcp-server/test/acceptance/adapters/aver-mcp.direct.ts`
- Modify: `packages/mcp-server/test/acceptance/domain-exploration.spec.ts`
- Modify: `packages/mcp-server/test/acceptance/test-execution.spec.ts`
- Modify: `packages/mcp-server/test/acceptance/scaffolding.spec.ts`
- Modify: `packages/mcp-server/test/acceptance/incremental-reporting.spec.ts`

**Step 1: Rebuild core package**

Run: `npm run build -w packages/aver`
Expected: Build succeeds. MCP server imports from built `aver` package.

**Step 2: Update MCP acceptance test files**

Same pattern as core tests. All callbacks change from `{ domain }` to `{ act, assert }`:
- `await domain.registerTestDomain(...)` → `await act.registerTestDomain(...)`
- `await domain.callTool(...)` → `await act.callTool(...)`
- `await domain.saveTestRun(...)` → `await act.saveTestRun(...)`
- `await domain.resetState()` → `await act.resetState()`
- `await domain.toolResultContains(...)` → `await assert.toolResultContains(...)`
- `await domain.toolResultHasLength(...)` → `await assert.toolResultHasLength(...)`
- `await domain.toolResultIsError(...)` → `await assert.toolResultIsError(...)`

The MCP dogfood adapter (`aver-mcp.direct.ts`) does NOT use `suiteInstance.domain` — it calls tool handlers directly. No changes needed to the adapter itself.

**Step 3: Run MCP server tests**

Run: `npm test -w packages/mcp-server`
Expected: All 37 tests pass.

**Step 4: Commit**

```bash
git add packages/mcp-server/test/
git commit -m "test: migrate MCP server tests to { act, query, assert } API"
```

---

### Task 6: Update MCP server source that references DomainProxy

**Files:**
- Modify: `packages/mcp-server/src/tools/domains.ts`
- Modify: `packages/mcp-server/src/tools/scaffolding.ts`

**Step 1: Check if these files reference DomainProxy or suite.domain**

These files import from `aver` and use registry functions. Check if they reference `DomainProxy` type — if so, update to new types. If they only use `getAdapters()` / `findAdapter()` they may not need changes.

**Step 2: Run full test suite**

Run: `npm test -w packages/mcp-server`
Expected: All 37 tests pass.

**Step 3: Commit if changes needed**

```bash
git add packages/mcp-server/src/
git commit -m "refactor: update MCP server source for new proxy types"
```

---

### Task 7: Final verification — all 88 tests green

**Step 1: Run full test suite across all packages**

Run: `npm test --workspaces`
Expected: 88 tests pass (49 aver + 37 mcp-server + 2 protocol-playwright).

**Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit -p packages/aver/tsconfig.json`
Expected: No type errors.

**Step 3: Verify build**

Run: `npm run build --workspaces`
Expected: All packages build successfully.

**Step 4: Final commit if any cleanup needed**

```bash
git commit -m "chore: final cleanup for { act, query, assert } API migration"
```
