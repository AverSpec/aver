import { describe, it, expect, beforeEach } from 'vitest'
import { createProxies } from '../../src/core/proxy'
import { defineDomain } from '../../src/core/domain'
import { implement } from '../../src/core/adapter'
import { action, query, assertion } from '../../src/core/markers'
import type { TraceEntry } from '../../src/core/trace'

const testDomain = defineDomain({
  name: 'ClockTest',
  actions: { doSomething: action() },
  queries: { getValue: query<number>() },
  assertions: { check: assertion() },
})

describe('injectable clock in createProxies', () => {
  it('uses injected clock for trace timing', async () => {
    let tick = 1000
    const fakeClock = () => tick++

    const adapter = implement(testDomain, {
      protocol: { name: 'unit', async setup() { return null }, async teardown() {} },
      actions: { doSomething: async () => {} },
      queries: { getValue: async () => 42 },
      assertions: { check: async () => {} },
    })

    const trace: TraceEntry[] = []
    const proxies = createProxies(
      testDomain,
      () => null,
      () => adapter,
      trace,
      undefined,
      undefined,
      fakeClock,
    )

    await proxies.act.doSomething()
    await proxies.query.getValue()
    await proxies.assert.check()

    expect(trace).toHaveLength(3)

    // Action: startAt = 1000, endAt = 1001
    expect(trace[0].startAt).toBe(1000)
    expect(trace[0].endAt).toBe(1001)
    expect(trace[0].durationMs).toBe(1)

    // Query: startAt = 1002, endAt = 1003
    expect(trace[1].startAt).toBe(1002)
    expect(trace[1].endAt).toBe(1003)
    expect(trace[1].durationMs).toBe(1)

    // Assertion: startAt = 1004, endAt = 1005
    expect(trace[2].startAt).toBe(1004)
    expect(trace[2].endAt).toBe(1005)
    expect(trace[2].durationMs).toBe(1)
  })

  it('defaults to Date.now when no clock provided', async () => {
    const adapter = implement(testDomain, {
      protocol: { name: 'unit', async setup() { return null }, async teardown() {} },
      actions: { doSomething: async () => {} },
      queries: { getValue: async () => 42 },
      assertions: { check: async () => {} },
    })

    const trace: TraceEntry[] = []
    const before = Date.now()
    const proxies = createProxies(
      testDomain,
      () => null,
      () => adapter,
      trace,
    )

    await proxies.act.doSomething()
    const after = Date.now()

    expect(trace).toHaveLength(1)
    expect(trace[0].startAt).toBeGreaterThanOrEqual(before)
    expect(trace[0].endAt).toBeLessThanOrEqual(after)
  })
})
