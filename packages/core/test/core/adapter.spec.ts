import { describe, it, expect } from 'vitest'
import { adapt } from '../../src/core/adapter'
import { defineDomain } from '../../src/core/domain'
import { action, query, assertion } from '../../src/core/markers'
import type { Protocol } from '../../src/core/protocol'

const testProtocol: Protocol<{ calls: string[] }> = {
  name: 'test',
  async setup() { return { calls: [] } },
  async teardown() {},
}

const cart = defineDomain({
  name: 'Cart',
  actions: {
    addItem: action<{ name: string }>(),
    checkout: action(),
  },
  queries: {
    total: query<number>(),
  },
  assertions: {
    isEmpty: assertion(),
    hasTotal: assertion<{ amount: number }>(),
  },
})

describe('adapt()', () => {
  it('creates an adapter with domain, protocol, and handlers', () => {
    const adapter = adapt(cart, {
      protocol: testProtocol,
      actions: {
        addItem: async (ctx, { name }) => { ctx.calls.push(`add:${name}`) },
        checkout: async (ctx) => { ctx.calls.push('checkout') },
      },
      queries: {
        total: async () => 42,
      },
      assertions: {
        isEmpty: async () => {},
        hasTotal: async () => {},
      },
    })

    expect(adapter.domain).toBe(cart)
    expect(adapter.protocol).toBe(testProtocol)
  })

  it('exposes executable handlers', async () => {
    const adapter = adapt(cart, {
      protocol: testProtocol,
      actions: {
        addItem: async (ctx, { name }) => { ctx.calls.push(`add:${name}`) },
        checkout: async (ctx) => { ctx.calls.push('checkout') },
      },
      queries: {
        total: async () => 99,
      },
      assertions: {
        isEmpty: async () => {},
        hasTotal: async () => {},
      },
    })

    const ctx = await testProtocol.setup()

    await adapter.handlers.actions.addItem(ctx, { name: 'Widget' })
    expect(ctx.calls).toEqual(['add:Widget'])

    const total = await adapter.handlers.queries.total(ctx)
    expect(total).toBe(99)
  })
})
