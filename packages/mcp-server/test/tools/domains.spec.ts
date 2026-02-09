import { describe, it, expect, beforeEach } from 'vitest'
import {
  listDomainsHandler,
  getDomainVocabularyHandler,
  listAdaptersHandler,
} from '../../src/tools/domains'
import {
  defineDomain, action, query, assertion,
  implement, direct,
  resetRegistry, registerAdapter,
} from 'aver'

const cart = defineDomain({
  name: 'Cart',
  actions: { addItem: action<{ name: string }>(), checkout: action() },
  queries: { total: query<number>() },
  assertions: { isEmpty: assertion() },
})

const cartAdapter = implement(cart, {
  protocol: direct(() => null),
  actions: {
    addItem: async () => {},
    checkout: async () => {},
  },
  queries: { total: async () => 0 },
  assertions: { isEmpty: async () => {} },
})

describe('list_domains handler', () => {
  beforeEach(() => {
    resetRegistry()
  })

  it('returns empty array when no adapters registered', () => {
    const result = listDomainsHandler()
    expect(result).toEqual([])
  })

  it('returns domain summaries from registered adapters', () => {
    registerAdapter(cartAdapter)
    const result = listDomainsHandler()
    expect(result).toEqual([
      {
        name: 'Cart',
        actions: ['addItem', 'checkout'],
        queries: ['total'],
        assertions: ['isEmpty'],
        actionCount: 2,
        queryCount: 1,
        assertionCount: 1,
      },
    ])
  })

  it('deduplicates domains when multiple adapters share a domain', () => {
    registerAdapter(cartAdapter)
    const cartAdapter2 = implement(cart, {
      protocol: direct(() => null),
      actions: { addItem: async () => {}, checkout: async () => {} },
      queries: { total: async () => 0 },
      assertions: { isEmpty: async () => {} },
    })
    registerAdapter(cartAdapter2)
    const result = listDomainsHandler()
    expect(result).toHaveLength(1)
  })
})

describe('get_domain_vocabulary handler', () => {
  beforeEach(() => {
    resetRegistry()
    registerAdapter(cartAdapter)
  })

  it('returns vocabulary for a named domain', () => {
    const result = getDomainVocabularyHandler('Cart')
    expect(result).toEqual({
      name: 'Cart',
      actions: ['addItem', 'checkout'],
      queries: ['total'],
      assertions: ['isEmpty'],
    })
  })

  it('returns null for unknown domain', () => {
    const result = getDomainVocabularyHandler('Unknown')
    expect(result).toBeNull()
  })
})

describe('list_adapters handler', () => {
  beforeEach(() => {
    resetRegistry()
  })

  it('returns empty array when no adapters registered', () => {
    const result = listAdaptersHandler()
    expect(result).toEqual([])
  })

  it('returns adapter summaries', () => {
    registerAdapter(cartAdapter)
    const result = listAdaptersHandler()
    expect(result).toEqual([
      { domainName: 'Cart', protocolName: 'direct' },
    ])
  })
})
