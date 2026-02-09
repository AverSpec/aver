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

  it('dispatches parameterized queries through adapter', async () => {
    const filterDomain = defineDomain({
      name: 'Filter',
      actions: {},
      queries: {
        itemsByStatus: query<{ status: string }, string[]>(),
      },
      assertions: {},
    })
    const items = { active: ['a', 'b'], done: ['c'] }
    const filterAdapter = implement(filterDomain, {
      protocol: testProtocol,
      actions: {},
      queries: {
        itemsByStatus: async (_ctx, { status }) => items[status as keyof typeof items] ?? [],
      },
      assertions: {},
    })

    const s = suite(filterDomain, filterAdapter)
    await s.setup()

    const result = await s.query.itemsByStatus({ status: 'active' })
    expect(result).toEqual(['a', 'b'])

    const trace = s.getTrace()
    expect(trace[0]).toMatchObject({
      kind: 'query',
      name: 'itemsByStatus',
      payload: { status: 'active' },
      status: 'pass',
    })

    await s.teardown()
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
