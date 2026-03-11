/**
 * Smoke tests: Aver machinery vs plain Vitest equivalence
 *
 * Each test proves that Aver's domain/adapter/suite machinery produces the same
 * observable outcomes as directly calling the underlying handler functions. This
 * serves as a cross-check that the framework is transparent — no unexpected
 * side-effects, no lost return values, no swallowed errors.
 *
 * Pattern:
 *   1. Do the same operation directly (plain handler call)
 *   2. Do it through Aver (suite programmatic API)
 *   3. Assert both produce equivalent results
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { defineDomain, action, query, assertion, adapt, suite } from '../../src/index'
import { resetRegistry } from '../../src/core/registry'
import { createProxies } from '../../src/core/proxy'
import type { Protocol } from '../../src/core/protocol'

// ---------------------------------------------------------------------------
// Minimal domain for smoke testing
//
// A simple in-memory counter store with named items. Business logic is
// deliberately trivial so every test focuses on framework equivalence, not
// domain correctness.
// ---------------------------------------------------------------------------

interface CounterStore {
  items: string[]
  count: number
}

function makeStore(): CounterStore {
  return { items: [], count: 0 }
}

const counter = defineDomain({
  name: 'Counter',
  actions: {
    addItem: action<{ name: string }>(),
    reset: action<void>(),
  },
  queries: {
    count: query<void, number>(),
    items: query<void, string[]>(),
  },
  assertions: {
    isEmpty: assertion<void>(),
    hasItem: assertion<{ name: string }>(),
  },
})

// Raw handler implementations — these are what Aver wraps. Referenced directly
// in the "plain" side of each smoke test so the comparison is not circular.
const rawHandlers = {
  actions: {
    addItem: async (store: CounterStore, { name }: { name: string }) => {
      store.items.push(name)
      store.count++
    },
    reset: async (store: CounterStore) => {
      store.items.length = 0
      store.count = 0
    },
  },
  queries: {
    count: async (store: CounterStore) => store.count,
    items: async (store: CounterStore) => [...store.items],
  },
  assertions: {
    isEmpty: async (store: CounterStore) => {
      if (store.count !== 0) throw new Error(`Expected empty but count is ${store.count}`)
    },
    hasItem: async (store: CounterStore, { name }: { name: string }) => {
      if (!store.items.includes(name)) throw new Error(`Item "${name}" not found`)
    },
  },
}

const counterProtocol: Protocol<CounterStore> = {
  name: 'unit',
  async setup() { return makeStore() },
  async teardown() {},
}

const counterAdapter = adapt(counter, {
  protocol: counterProtocol,
  actions: rawHandlers.actions,
  queries: rawHandlers.queries,
  assertions: rawHandlers.assertions,
})

// ---------------------------------------------------------------------------

describe('smoke tests: Aver machinery vs plain Vitest equivalence', () => {
  beforeEach(() => resetRegistry())
  afterEach(() => resetRegistry())

  // -------------------------------------------------------------------------
  // 1. Action dispatch equivalence
  //    Direct handler call vs s.act.addItem() — both mutate state identically
  // -------------------------------------------------------------------------
  it('action dispatch: Aver and direct call produce identical state mutation', async () => {
    // Plain: call handler directly on a bare store
    const directStore = makeStore()
    await rawHandlers.actions.addItem(directStore, { name: 'Widget' })

    // Aver: dispatch through suite programmatic API
    const s = suite(counter, counterAdapter)
    await s.setup()
    await s.act.addItem({ name: 'Widget' })
    const averCount = await s.query.count()
    await s.teardown()

    // Both reflect the same mutation
    expect(directStore.count).toBe(1)
    expect(averCount).toBe(1)
    expect(directStore.items).toEqual(['Widget'])
  })

  // -------------------------------------------------------------------------
  // 2. Query dispatch equivalence
  //    Direct handler call vs s.query.*() — both return the same values
  // -------------------------------------------------------------------------
  it('query dispatch: Aver and direct call return identical values', async () => {
    // Plain
    const directStore = makeStore()
    await rawHandlers.actions.addItem(directStore, { name: 'A' })
    await rawHandlers.actions.addItem(directStore, { name: 'B' })
    const directCount = await rawHandlers.queries.count(directStore)
    const directItems = await rawHandlers.queries.items(directStore)

    // Aver
    const s = suite(counter, counterAdapter)
    await s.setup()
    await s.act.addItem({ name: 'A' })
    await s.act.addItem({ name: 'B' })
    const averCount = await s.query.count()
    const averItems = await s.query.items()
    await s.teardown()

    expect(averCount).toBe(directCount)
    expect(averItems).toEqual(directItems)
  })

  // -------------------------------------------------------------------------
  // 3. Assertion pass equivalence
  //    Direct handler call (no throw) vs s.assert.isEmpty() — both resolve void
  // -------------------------------------------------------------------------
  it('assertion pass: Aver and direct call both succeed without throwing', async () => {
    // Plain: fresh store is empty so handler must not throw
    const directStore = makeStore()
    await expect(rawHandlers.assertions.isEmpty(directStore)).resolves.toBeUndefined()

    // Aver: assert on a fresh setup
    const s = suite(counter, counterAdapter)
    await s.setup()
    await expect(s.assert.isEmpty()).resolves.toBeUndefined()
    await s.teardown()
  })

  // -------------------------------------------------------------------------
  // 4. Assertion failure equivalence
  //    Direct handler throws vs s.assert.*() throws — identical error message
  // -------------------------------------------------------------------------
  it('assertion failure: Aver and direct call throw identical errors', async () => {
    // Plain: call handler on a store that does NOT have the item
    const directStore = makeStore()
    const directError = await catchError(() =>
      rawHandlers.assertions.hasItem(directStore, { name: 'Missing' })
    )

    // Aver: same assertion through suite
    const s = suite(counter, counterAdapter)
    await s.setup()
    const averError = await catchError(() => s.assert.hasItem({ name: 'Missing' }))
    await s.teardown()

    expect(directError).toBeDefined()
    expect(averError).toBeDefined()
    expect(averError!.message).toBe(directError!.message)
  })

  // -------------------------------------------------------------------------
  // 5. Trace recording: kinds, names, statuses, payloads
  //    After a mixed sequence, getTrace() has correct entries in order
  // -------------------------------------------------------------------------
  it('trace recording: kinds, names, statuses, and payloads are captured correctly', async () => {
    const s = suite(counter, counterAdapter)
    await s.setup()

    await s.act.addItem({ name: 'TracedItem' })
    await s.query.count()
    await s.assert.hasItem({ name: 'TracedItem' })

    const trace = s.getTrace()
    await s.teardown()

    expect(trace).toHaveLength(3)
    expect(trace[0]).toMatchObject({
      kind: 'action', category: 'act', name: 'addItem',
      status: 'pass', payload: { name: 'TracedItem' },
    })
    expect(trace[1]).toMatchObject({
      kind: 'query', category: 'query', name: 'count',
      status: 'pass', result: 1,
    })
    expect(trace[2]).toMatchObject({
      kind: 'assertion', category: 'assert', name: 'hasItem',
      status: 'pass',
    })
  })

  // -------------------------------------------------------------------------
  // 6. Trace captures query return value
  //    The TraceEntry for a query has result === direct handler return value
  // -------------------------------------------------------------------------
  it('trace captures query result: trace entry result matches direct return value', async () => {
    // Plain: capture what the handler returns
    const directStore = makeStore()
    await rawHandlers.actions.addItem(directStore, { name: 'A' })
    await rawHandlers.actions.addItem(directStore, { name: 'B' })
    const directResult = await rawHandlers.queries.items(directStore)

    // Aver: run the same sequence
    const s = suite(counter, counterAdapter)
    await s.setup()
    await s.act.addItem({ name: 'A' })
    await s.act.addItem({ name: 'B' })
    await s.query.items()

    const trace = s.getTrace()
    await s.teardown()

    const queryEntry = trace.find(e => e.name === 'items')
    expect(queryEntry).toBeDefined()
    // The trace result must equal what the direct handler returned
    expect(queryEntry!.result).toEqual(directResult)
  })

  // -------------------------------------------------------------------------
  // 7. Failed action: trace records 'fail' status and original error is re-thrown
  //    An action that throws — Aver records it in trace and propagates the error
  // -------------------------------------------------------------------------
  it('action failure: trace records fail status and original error is re-thrown', async () => {
    const boomDomain = defineDomain({
      name: 'Boom',
      actions: { explode: action<void>() },
      queries: {},
      assertions: {},
    })
    const boomAdapter = adapt(boomDomain, {
      protocol: counterProtocol as Protocol<any>,
      actions: { explode: async () => { throw new Error('boom!') } },
      queries: {},
      assertions: {},
    })

    // Plain: direct handler call throws
    const directError = await catchError(() => boomAdapter.handlers.actions.explode({}, undefined))

    // Aver: suite re-throws and records in trace
    const s = suite(boomDomain, boomAdapter)
    await s.setup()
    const averError = await catchError(() => s.act.explode())
    const trace = s.getTrace()
    await s.teardown()

    // Both produce the same error
    expect(directError?.message).toBe('boom!')
    expect(averError?.message).toBe(directError?.message)

    // Aver records it as fail with the error attached
    expect(trace).toHaveLength(1)
    expect(trace[0]).toMatchObject({ kind: 'action', name: 'explode', status: 'fail' })
    expect((trace[0].error as Error).message).toBe('boom!')
  })

  // -------------------------------------------------------------------------
  // 8. Coverage tracking
  //    getCoverage() reflects exactly what vocabulary was exercised and what wasn't
  // -------------------------------------------------------------------------
  it('coverage tracking: reflects which vocabulary was called and which was not', async () => {
    const s = suite(counter, counterAdapter)
    await s.setup()

    // Call only addItem and count — leave reset, items, isEmpty, hasItem uncalled
    await s.act.addItem({ name: 'CoverageTest' })
    await s.query.count()

    const coverage = s.getCoverage()
    await s.teardown()

    expect(coverage.domain).toBe('Counter')

    // Called
    expect(coverage.actions.called).toContain('addItem')
    expect(coverage.queries.called).toContain('count')

    // Not called
    expect(coverage.actions.called).not.toContain('reset')
    expect(coverage.queries.called).not.toContain('items')
    expect(coverage.assertions.called).toEqual([])

    // Total vocabulary: 2 actions + 2 queries + 2 assertions = 6
    // Called: addItem + count = 2  →  2/6 = 33%
    expect(coverage.percentage).toBe(33)
  })

  // -------------------------------------------------------------------------
  // 9. Given/When/Then category stamps
  //    given.X / when.X / then.X call the same handler but stamp different category
  // -------------------------------------------------------------------------
  it('given/when/then: same handler is invoked but trace category differs', async () => {
    // Plain side: calling rawHandlers directly (no category concept) produces the
    // same final state as calling via given/when/then proxies. The category label
    // is purely a metadata annotation — it does not change handler behavior.
    const plainStore = makeStore()
    await rawHandlers.actions.addItem(plainStore, { name: 'Setup' })
    await rawHandlers.actions.addItem(plainStore, { name: 'Trigger' })
    await rawHandlers.assertions.hasItem(plainStore, { name: 'Trigger' })

    // Aver side: use createProxies directly to exercise given/when/then categories
    // without needing to mock globalThis.test
    const averStore = makeStore()
    const trace: any[] = []
    const proxies = createProxies(
      counter,
      () => averStore,
      () => counterAdapter,
      trace,
    )

    await proxies.given.addItem({ name: 'Setup' })
    await proxies.when.addItem({ name: 'Trigger' })
    await proxies.then.hasItem({ name: 'Trigger' })

    // Categories are different (given/when/then vs no category), but the underlying
    // state mutation is identical — same handler was called with the same arguments
    expect(averStore.items).toEqual(plainStore.items)

    // And the trace records the correct categories
    expect(trace).toHaveLength(3)
    expect(trace[0]).toMatchObject({ kind: 'action', category: 'given', name: 'addItem', payload: { name: 'Setup' } })
    expect(trace[1]).toMatchObject({ kind: 'action', category: 'when', name: 'addItem', payload: { name: 'Trigger' } })
    expect(trace[2]).toMatchObject({ kind: 'assertion', category: 'then', name: 'hasItem' })
  })

  // -------------------------------------------------------------------------
  // 10. Protocol lifecycle: setup → first op → teardown ordering
  //     Aver calls setup before any operation and teardown after — same as manual
  // -------------------------------------------------------------------------
  it('protocol lifecycle: setup creates fresh context, teardown is called in order', async () => {
    const log: string[] = []

    const lifecycleProtocol: Protocol<CounterStore> = {
      name: 'lifecycle',
      async setup() {
        log.push('setup')
        return makeStore()
      },
      async teardown() {
        log.push('teardown')
      },
    }

    const lifecycleAdapter = adapt(counter, {
      protocol: lifecycleProtocol,
      actions: rawHandlers.actions,
      queries: rawHandlers.queries,
      assertions: rawHandlers.assertions,
    })

    // Aver side
    const s = suite(counter, lifecycleAdapter)
    expect(log).toEqual([])

    await s.setup()
    expect(log).toEqual(['setup'])

    await s.act.addItem({ name: 'LCTest' })
    const count = await s.query.count()
    expect(count).toBe(1)

    await s.teardown()
    expect(log).toEqual(['setup', 'teardown'])

    // Plain side: manually calling setup/teardown produces the same log sequence
    log.length = 0
    const ctx = await lifecycleProtocol.setup()
    expect(log).toEqual(['setup'])
    await rawHandlers.actions.addItem(ctx, { name: 'LCTest' })
    expect(ctx.count).toBe(1)
    await lifecycleProtocol.teardown(ctx)
    expect(log).toEqual(['setup', 'teardown'])
  })

  // -------------------------------------------------------------------------
  // 11. Multi-operation sequence equivalence
  //     A sequence of add/reset/add through Aver matches direct handler calls
  // -------------------------------------------------------------------------
  it('multi-operation sequence: Aver and direct calls produce identical final state', async () => {
    // Plain: add 3, reset, add 1
    const directStore = makeStore()
    await rawHandlers.actions.addItem(directStore, { name: 'A' })
    await rawHandlers.actions.addItem(directStore, { name: 'B' })
    await rawHandlers.actions.addItem(directStore, { name: 'C' })
    await rawHandlers.actions.reset(directStore)
    await rawHandlers.actions.addItem(directStore, { name: 'D' })
    const directCount = await rawHandlers.queries.count(directStore)
    const directItems = await rawHandlers.queries.items(directStore)

    // Aver: same sequence through suite
    const s = suite(counter, counterAdapter)
    await s.setup()
    await s.act.addItem({ name: 'A' })
    await s.act.addItem({ name: 'B' })
    await s.act.addItem({ name: 'C' })
    await s.act.reset()
    await s.act.addItem({ name: 'D' })
    const averCount = await s.query.count()
    const averItems = await s.query.items()
    await s.teardown()

    expect(averCount).toBe(directCount)
    expect(averItems).toEqual(directItems)
    expect(averCount).toBe(1)
    expect(averItems).toEqual(['D'])
  })

  // -------------------------------------------------------------------------
  // 12. Trace timing: each entry has startAt, endAt, durationMs >= 0
  //     The framework adds timing metadata without distorting results
  // -------------------------------------------------------------------------
  it('trace timing: entries include non-negative timing metadata', async () => {
    const s = suite(counter, counterAdapter)
    await s.setup()

    await s.act.addItem({ name: 'Timed' })
    await s.query.count()
    await s.assert.hasItem({ name: 'Timed' })

    const trace = s.getTrace()
    await s.teardown()

    expect(trace).toHaveLength(3)
    for (const entry of trace) {
      expect(typeof entry.startAt).toBe('number')
      expect(typeof entry.endAt).toBe('number')
      expect(typeof entry.durationMs).toBe('number')
      expect(entry.durationMs).toBeGreaterThanOrEqual(0)
      expect(entry.endAt!).toBeGreaterThanOrEqual(entry.startAt!)
    }
  })
})

// ---------------------------------------------------------------------------
// Helper: capture a thrown error without re-throwing
// ---------------------------------------------------------------------------
async function catchError(fn: () => Promise<unknown>): Promise<Error | undefined> {
  try {
    await fn()
    return undefined
  } catch (e) {
    return e as Error
  }
}
