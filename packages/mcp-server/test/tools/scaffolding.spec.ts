import { describe, it, expect, beforeEach } from 'vitest'
import {
  describeDomainStructureHandler,
  describeAdapterStructureHandler,
} from '../../src/tools/scaffolding'
import {
  defineDomain, action, query, assertion,
  implement, unit,
  resetRegistry, registerAdapter,
} from 'aver'

const cart = defineDomain({
  name: 'Cart',
  actions: { addItem: action(), removeItem: action() },
  queries: { total: query<number>() },
  assertions: { isEmpty: assertion(), hasTotal: assertion() },
})

const cartAdapter = implement(cart, {
  protocol: unit(() => null),
  actions: { addItem: async () => {}, removeItem: async () => {} },
  queries: { total: async () => 0 },
  assertions: { isEmpty: async () => {}, hasTotal: async () => {} },
})

describe('describe_domain_structure handler', () => {
  it('returns a template structure from a description', () => {
    const result = describeDomainStructureHandler('shopping cart')
    expect(result.suggestedName).toBe('shoppingCart')
    expect(result.actions).toBeDefined()
    expect(result.queries).toBeDefined()
    expect(result.assertions).toBeDefined()
    expect(result.actions.length).toBeGreaterThan(0)
  })
})

describe('describe_adapter_structure handler', () => {
  beforeEach(() => {
    resetRegistry()
    registerAdapter(cartAdapter)
  })

  it('returns handler structure for a domain and protocol', () => {
    const result = describeAdapterStructureHandler('Cart', 'unit')
    expect(result).toEqual({
      domain: 'Cart',
      protocol: 'unit',
      handlers: {
        actions: ['addItem', 'removeItem'],
        queries: ['total'],
        assertions: ['isEmpty', 'hasTotal'],
      },
    })
  })

  it('returns null when domain not found', () => {
    const result = describeAdapterStructureHandler('Unknown', 'unit')
    expect(result).toBeNull()
  })

  it('returns null when adapter for protocol not found', () => {
    const result = describeAdapterStructureHandler('Cart', 'playwright')
    expect(result).toBeNull()
  })
})
