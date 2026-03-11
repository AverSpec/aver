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

const noQueriesDomain = defineDomain({
  name: 'NoQueries',
  actions: {
    doThing: action(),
  },
  assertions: {
    thingDone: assertion(),
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

  it('allows omitting queries when domain has no queries', () => {
    const adapter = implement(noQueriesDomain, {
      protocol: testProtocol,
      actions: {
        doThing: async (ctx) => { ctx.calls.push('doThing') },
      },
      assertions: {
        thingDone: async () => {},
      },
    })

    expect(adapter.domain).toBe(noQueriesDomain)
    expect(adapter.handlers.queries).toEqual({})
  })

  it('can omit queries field and still execute actions and assertions', async () => {
    const adapter = implement(noQueriesDomain, {
      protocol: testProtocol,
      actions: {
        doThing: async (ctx) => { ctx.calls.push('doThing') },
      },
      assertions: {
        thingDone: async (ctx) => {
          if (!ctx.calls.includes('doThing')) throw new Error('doThing not called')
        },
      },
    })

    const ctx = await testProtocol.setup()
    await adapter.handlers.actions.doThing(ctx)
    expect(ctx.calls).toContain('doThing')
    await expect(adapter.handlers.assertions.thingDone(ctx)).resolves.toBeUndefined()
  })
})
