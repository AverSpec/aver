import { describe, it, expect, beforeEach } from 'vitest'
import { suite } from '../../src/core/suite'
import { _resetRegistry, _registerAdapter, _getAdapters } from '../../src/core/registry'
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

describe('suite()', () => {
  beforeEach(() => {
    _resetRegistry()
    _registerAdapter(cartAdapter)
    calls.length = 0
  })

  it('returns a test function', () => {
    const s = suite(cart)
    expect(typeof s.test).toBe('function')
  })

  it('dispatches actions through adapter', async () => {
    const s = suite(cart)
    await s._setupForTest()

    await s.domain.addItem({ name: 'Widget' })
    expect(calls).toContain('add:Widget')

    await s._teardownForTest()
  })

  it('dispatches queries through adapter', async () => {
    const s = suite(cart)
    await s._setupForTest()

    const total = await s.domain.total()
    expect(total).toBe(42)

    await s._teardownForTest()
  })

  it('dispatches assertions through adapter', async () => {
    const s = suite(cart)
    await s._setupForTest()

    await s.domain.isEmpty()

    await s._teardownForTest()
  })

  it('records action trace', async () => {
    const s = suite(cart)
    await s._setupForTest()

    await s.domain.addItem({ name: 'A' })
    await s.domain.total()
    await s.domain.isEmpty()

    expect(s._getTrace()).toEqual([
      { kind: 'action', name: 'addItem', payload: { name: 'A' }, status: 'pass' },
      { kind: 'query', name: 'total', payload: undefined, status: 'pass', result: 42 },
      { kind: 'assertion', name: 'isEmpty', payload: undefined, status: 'pass' },
    ])

    await s._teardownForTest()
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
    _registerAdapter(failAdapter)

    const s = suite(failDomain)
    await s._setupForTest()

    await expect(s.domain.check()).rejects.toThrow('boom')

    const trace = s._getTrace()
    expect(trace[0]).toMatchObject({ kind: 'assertion', name: 'check', status: 'fail' })

    await s._teardownForTest()
  })

  it('throws when no adapter registered', async () => {
    _resetRegistry()
    const s = suite(cart)
    await expect(s._setupForTest()).rejects.toThrow('No adapter registered for domain "Cart"')
  })
})

describe('_getAdapters()', () => {
  beforeEach(() => {
    _resetRegistry()
  })

  it('returns empty array when no adapters registered', () => {
    expect(_getAdapters()).toEqual([])
  })

  it('returns all registered adapters', () => {
    _registerAdapter(cartAdapter)
    const adapters = _getAdapters()
    expect(adapters).toHaveLength(1)
    expect(adapters[0].domain).toBe(cart)
  })

  it('returns a copy, not the internal array', () => {
    _registerAdapter(cartAdapter)
    const a1 = _getAdapters()
    const a2 = _getAdapters()
    expect(a1).not.toBe(a2)
    expect(a1).toEqual(a2)
  })
})
