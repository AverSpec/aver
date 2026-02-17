import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerDomain, getDomains, getDomain,
  registerAdapter, getAdapters, resetRegistry,
} from '../../src/core/registry'
import { defineDomain } from '../../src/core/domain'
import { implement } from '../../src/core/adapter'
import { unit } from '../../src/protocols/unit'
import { action, query, assertion } from '../../src/core/markers'

const cart = defineDomain({
  name: 'Cart',
  actions: { addItem: action() },
  queries: { total: query<number>() },
  assertions: { isEmpty: assertion() },
})

const orders = defineDomain({
  name: 'Orders',
  actions: { place: action() },
  queries: { list: query<string[]>() },
  assertions: { hasOrder: assertion() },
})

describe('domain registry', () => {
  beforeEach(() => {
    resetRegistry()
  })

  it('starts empty', () => {
    expect(getDomains()).toEqual([])
  })

  it('registers a domain', () => {
    registerDomain(cart)
    expect(getDomains()).toHaveLength(1)
    expect(getDomains()[0].name).toBe('Cart')
  })

  it('deduplicates domains by name', () => {
    registerDomain(cart)
    registerDomain(cart)
    expect(getDomains()).toHaveLength(1)
  })

  it('registers multiple domains', () => {
    registerDomain(cart)
    registerDomain(orders)
    expect(getDomains()).toHaveLength(2)
  })

  it('retrieves a domain by name', () => {
    registerDomain(cart)
    registerDomain(orders)
    expect(getDomain('Cart')).toBe(cart)
    expect(getDomain('Orders')).toBe(orders)
  })

  it('returns undefined for unknown domain name', () => {
    expect(getDomain('Unknown')).toBeUndefined()
  })

  it('returns a copy from getDomains', () => {
    registerDomain(cart)
    const domains = getDomains()
    domains.push(orders)
    expect(getDomains()).toHaveLength(1)
  })
})

describe('registerAdapter auto-registers domain', () => {
  beforeEach(() => {
    resetRegistry()
  })

  it('auto-registers the domain when registering an adapter', () => {
    const adapter = implement(cart, {
      protocol: unit(() => null),
      actions: { addItem: async () => {} },
      queries: { total: async () => 0 },
      assertions: { isEmpty: async () => {} },
    })
    registerAdapter(adapter)
    expect(getDomains()).toHaveLength(1)
    expect(getDomain('Cart')).toBe(cart)
  })

  it('does not duplicate domain when adapter registered twice', () => {
    const adapter = implement(cart, {
      protocol: unit(() => null),
      actions: { addItem: async () => {} },
      queries: { total: async () => 0 },
      assertions: { isEmpty: async () => {} },
    })
    registerAdapter(adapter)
    registerAdapter(adapter)
    expect(getDomains()).toHaveLength(1)
  })
})

describe('resetRegistry', () => {
  it('clears both adapters and domains', () => {
    registerDomain(cart)
    const adapter = implement(cart, {
      protocol: unit(() => null),
      actions: { addItem: async () => {} },
      queries: { total: async () => 0 },
      assertions: { isEmpty: async () => {} },
    })
    registerAdapter(adapter)
    resetRegistry()
    expect(getDomains()).toEqual([])
    expect(getAdapters()).toEqual([])
  })
})
