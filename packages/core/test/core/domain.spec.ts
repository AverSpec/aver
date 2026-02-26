import { describe, it, expect } from 'vitest'
import { defineDomain } from '../../src/core/domain'
import { action, query, assertion } from '../../src/core/markers'

describe('defineDomain()', () => {
  it('creates a domain with name and vocabulary', () => {
    const cart = defineDomain({
      name: 'ShoppingCart',
      actions: {
        addItem: action<{ name: string; qty: number }>(),
        checkout: action(),
      },
      queries: {
        cartTotal: query<number>(),
      },
      assertions: {
        hasTotal: assertion<{ amount: number }>(),
        isEmpty: assertion(),
      },
    })

    expect(cart.name).toBe('ShoppingCart')
    expect(cart.vocabulary.actions.addItem).toEqual({ kind: 'action' })
    expect(cart.vocabulary.actions.checkout).toEqual({ kind: 'action' })
    expect(cart.vocabulary.queries.cartTotal).toEqual({ kind: 'query' })
    expect(cart.vocabulary.assertions.hasTotal).toEqual({ kind: 'assertion' })
    expect(cart.vocabulary.assertions.isEmpty).toEqual({ kind: 'assertion' })
  })

  it('allows empty vocabulary sections', () => {
    const minimal = defineDomain({
      name: 'Minimal',
      actions: {},
      queries: {},
      assertions: {},
    })

    expect(minimal.name).toBe('Minimal')
    expect(minimal.vocabulary.actions).toEqual({})
  })

  it('exposes vocabulary keys for runtime enumeration', () => {
    const cart = defineDomain({
      name: 'Cart',
      actions: { addItem: action(), removeItem: action() },
      queries: { total: query<number>() },
      assertions: { isEmpty: assertion() },
    })

    expect(Object.keys(cart.vocabulary.actions)).toEqual(['addItem', 'removeItem'])
    expect(Object.keys(cart.vocabulary.queries)).toEqual(['total'])
    expect(Object.keys(cart.vocabulary.assertions)).toEqual(['isEmpty'])
  })
})

describe('domain.extend()', () => {
  it('merges extension vocabulary with parent', () => {
    const base = defineDomain({
      name: 'Cart',
      actions: { addItem: action() },
      queries: { total: query<number>() },
      assertions: { isEmpty: assertion() },
    })

    const extended = base.extend('CartUI', {
      assertions: {
        showsSpinner: assertion(),
      },
    })

    expect(extended.name).toBe('CartUI')
    expect(extended.vocabulary.actions.addItem).toEqual({ kind: 'action' })
    expect(extended.vocabulary.queries.total).toEqual({ kind: 'query' })
    expect(extended.vocabulary.assertions.isEmpty).toEqual({ kind: 'assertion' })
    expect(extended.vocabulary.assertions.showsSpinner).toEqual({ kind: 'assertion' })
  })

  it('tracks parent domain', () => {
    const base = defineDomain({
      name: 'Cart',
      actions: {},
      queries: {},
      assertions: {},
    })

    const extended = base.extend('CartExtended', { assertions: { foo: assertion() } })
    expect(extended.parent).toBe(base)
  })

  it('chains multiple extends accumulating vocabulary', () => {
    const base = defineDomain({
      name: 'Cart',
      actions: { addItem: action() },
      queries: {},
      assertions: {},
    })

    const extended = base
      .extend('CartWithQueries', { queries: { total: query<number>() } })
      .extend('CartFull', { assertions: { isEmpty: assertion() } })

    expect(extended.vocabulary.actions.addItem).toEqual({ kind: 'action' })
    expect(extended.vocabulary.queries.total).toEqual({ kind: 'query' })
    expect(extended.vocabulary.assertions.isEmpty).toEqual({ kind: 'assertion' })
  })

  it('gives extended domain its own name, distinct from parent', () => {
    const base = defineDomain({
      name: 'Cart',
      actions: { addItem: action() },
      queries: {},
      assertions: {},
    })

    const extended = base.extend('CartUI', {
      assertions: { showsSpinner: assertion() },
    })

    expect(extended.name).toBe('CartUI')
    expect(base.name).toBe('Cart')
    expect(extended.name).not.toBe(base.name)
  })

  it('allows extending with empty sections', () => {
    const base = defineDomain({
      name: 'Cart',
      actions: { addItem: action() },
      queries: {},
      assertions: {},
    })

    const extended = base.extend('CartEmpty', {})
    expect(extended.vocabulary.actions.addItem).toEqual({ kind: 'action' })
  })

  it('throws error when extension duplicates parent action name', () => {
    const base = defineDomain({
      name: 'Cart',
      actions: { addItem: action() },
      queries: {},
      assertions: {},
    })

    expect(() => {
      base.extend('CartDuplicate', {
        actions: { addItem: action() },
      })
    }).toThrow(
      "Domain extension collision: action(s) 'addItem' already exist in parent domain 'Cart'"
    )
  })

  it('throws error when extension duplicates parent query name', () => {
    const base = defineDomain({
      name: 'Cart',
      actions: {},
      queries: { total: query<number>() },
      assertions: {},
    })

    expect(() => {
      base.extend('CartDuplicate', {
        queries: { total: query<number>() },
      })
    }).toThrow(
      "Domain extension collision: query(s) 'total' already exist in parent domain 'Cart'"
    )
  })

  it('throws error when extension duplicates parent assertion name', () => {
    const base = defineDomain({
      name: 'Cart',
      actions: {},
      queries: {},
      assertions: { isEmpty: assertion() },
    })

    expect(() => {
      base.extend('CartDuplicate', {
        assertions: { isEmpty: assertion() },
      })
    }).toThrow(
      "Domain extension collision: assertion(s) 'isEmpty' already exist in parent domain 'Cart'"
    )
  })

  it('throws error when extension duplicates multiple parent vocabulary items', () => {
    const base = defineDomain({
      name: 'Cart',
      actions: { addItem: action(), removeItem: action() },
      queries: { total: query<number>() },
      assertions: { isEmpty: assertion() },
    })

    expect(() => {
      base.extend('CartDuplicate', {
        actions: { addItem: action(), newAction: action() },
        queries: { total: query<number>() },
        assertions: { isEmpty: assertion() },
      })
    }).toThrow()

    // Verify it detects actions first
    try {
      base.extend('CartDuplicate', {
        actions: { addItem: action() },
      })
      expect.fail('Should have thrown')
    } catch (e) {
      expect((e as Error).message).toContain('addItem')
    }
  })

  it('allows extending with new names even when parent has same names in different vocabulary sections', () => {
    const base = defineDomain({
      name: 'Cart',
      actions: { process: action() },
      queries: {},
      assertions: {},
    })

    // This should succeed - extending with a query named 'process' doesn't collide
    const extended = base.extend('CartExtended', {
      queries: { process: query<number>() },
    })

    expect(extended.vocabulary.actions.process).toEqual({ kind: 'action' })
    expect(extended.vocabulary.queries.process).toEqual({ kind: 'query' })
  })
})
