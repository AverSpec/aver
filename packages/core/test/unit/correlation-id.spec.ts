import { describe, it, expect } from 'vitest'
import { defineDomain, action, query, assertion, adapt, suite } from '../../src/index'
import type { Protocol } from '../../src/core/protocol'

const testProtocol: Protocol<void> = {
  name: 'test',
  async setup() {},
  async teardown() {},
}

describe('correlation IDs', () => {
  const testDomain = defineDomain({
    name: 'CorrelationTest',
    actions: { doSomething: action<void>() },
    queries: { getSomething: query<void, string>() },
    assertions: { checkSomething: assertion<void>() },
  })

  const adapter = adapt(testDomain, {
    protocol: testProtocol,
    actions: {
      doSomething: async () => {},
    },
    queries: {
      getSomething: async () => 'result',
    },
    assertions: {
      checkSomething: async () => {},
    },
  })

  it('adds correlationId to all trace entries in a test', async () => {
    const { act, query: q, assert: a, getTrace } = suite(testDomain, adapter)
    await act.doSomething()
    await q.getSomething()
    await a.checkSomething()
    const entries = getTrace()
    expect(entries.length).toBe(3)
    // All should have the same correlationId
    const id = entries[0].correlationId
    expect(id).toBeDefined()
    expect(typeof id).toBe('string')
    for (const entry of entries) {
      expect(entry.correlationId).toBe(id)
    }
  })

  it('generates different correlationIds for different test runs', async () => {
    const s1 = suite(testDomain, adapter)
    const s2 = suite(testDomain, adapter)
    await s1.act.doSomething()
    await s2.act.doSomething()
    const id1 = s1.getTrace()[0].correlationId
    const id2 = s2.getTrace()[0].correlationId
    expect(id1).toBeDefined()
    expect(id2).toBeDefined()
    expect(id1).not.toBe(id2)
  })
})
