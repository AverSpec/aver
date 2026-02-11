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

    const extended = base.extend({
      assertions: {
        showsSpinner: assertion(),
      },
    })

    expect(extended.name).toBe('Cart')
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

    const extended = base.extend({ assertions: { foo: assertion() } })
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
      .extend({ queries: { total: query<number>() } })
      .extend({ assertions: { isEmpty: assertion() } })

    expect(extended.vocabulary.actions.addItem).toEqual({ kind: 'action' })
    expect(extended.vocabulary.queries.total).toEqual({ kind: 'query' })
    expect(extended.vocabulary.assertions.isEmpty).toEqual({ kind: 'assertion' })
  })

  it('allows extending with empty sections', () => {
    const base = defineDomain({
      name: 'Cart',
      actions: { addItem: action() },
      queries: {},
      assertions: {},
    })

    const extended = base.extend({})
    expect(extended.vocabulary.actions.addItem).toEqual({ kind: 'action' })
  })
})
