import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { suite } from '../../src/core/suite'
import type { SuiteInternals } from '../../src/core/suite'
import { resetRegistry, registerAdapter, getAdapters } from '../../src/core/registry'
import { implement } from '../../src/core/adapter'
import { defineDomain } from '../../src/core/domain'
import { defineConfig } from '../../src/core/config'
import { resetAll } from '../../src/core/reset'
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

describe('suite() — programmatic API', () => {
  beforeEach(() => {
    resetRegistry()
    calls.length = 0
  })

  it('dispatches actions through adapter', async () => {
    const s = suite(cart, cartAdapter)
    await s.setup()

    await s.act.addItem({ name: 'Widget' })
    expect(calls).toContain('add:Widget')

    await s.teardown()
  })

  it('dispatches queries through adapter', async () => {
    const s = suite(cart, cartAdapter)
    await s.setup()

    const total = await s.query.total()
    expect(total).toBe(42)

    await s.teardown()
  })

  it('dispatches assertions through adapter', async () => {
    const s = suite(cart, cartAdapter)
    await s.setup()

    await s.assert.isEmpty()

    await s.teardown()
  })

  it('records action trace', async () => {
    const s = suite(cart, cartAdapter)
    await s.setup()

    await s.act.addItem({ name: 'A' })
    await s.query.total()
    await s.assert.isEmpty()

    const trace = s.getTrace()
    expect(trace).toHaveLength(3)
    expect(trace[0]).toMatchObject({ kind: 'action', category: 'act', name: 'addItem', payload: { name: 'A' }, status: 'pass' })
    expect(trace[1]).toMatchObject({ kind: 'query', category: 'query', name: 'total', payload: undefined, status: 'pass', result: 42 })
    expect(trace[2]).toMatchObject({ kind: 'assertion', category: 'assert', name: 'isEmpty', payload: undefined, status: 'pass' })

    await s.teardown()
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

    const s = suite(failDomain, failAdapter)
    await s.setup()

    await expect(s.assert.check()).rejects.toThrow('boom')

    const trace = s.getTrace()
    expect(trace[0]).toMatchObject({ kind: 'assertion', name: 'check', status: 'fail' })

    await s.teardown()
  })

  it('throws descriptive error when no adapter registered', async () => {
    const s = suite(cart)
    await expect(() => s.setup()).rejects.toThrow('No adapter registered for domain "Cart"')
  })

  it('dispatches parameterized queries through adapter', async () => {
    const filterDomain = defineDomain({
      name: 'Filter',
      actions: {},
      queries: {
        itemsByStatus: query<{ status: string }, string[]>(),
      },
      assertions: {},
    })
    const items = { active: ['a', 'b'], done: ['c'] }
    const filterAdapter = implement(filterDomain, {
      protocol: testProtocol,
      actions: {},
      queries: {
        itemsByStatus: async (_ctx, { status }) => items[status as keyof typeof items] ?? [],
      },
      assertions: {},
    })

    const s = suite(filterDomain, filterAdapter)
    await s.setup()

    const result = await s.query.itemsByStatus({ status: 'active' })
    expect(result).toEqual(['a', 'b'])

    const trace = s.getTrace()
    expect(trace[0]).toMatchObject({
      kind: 'query',
      name: 'itemsByStatus',
      payload: { status: 'active' },
      status: 'pass',
    })

    await s.teardown()
  })

  it('resolves adapter from registry when not passed directly', async () => {
    registerAdapter(cartAdapter)
    const s = suite(cart)
    await s.setup()

    await s.act.addItem({ name: 'FromRegistry' })
    expect(calls).toContain('add:FromRegistry')

    await s.teardown()
  })

  it('tracks vocabulary coverage', async () => {
    const s = suite(cart, cartAdapter)
    await s.setup()

    await s.act.addItem({ name: 'A' })
    await s.query.total()
    // Intentionally don't call assert.isEmpty

    const coverage = s.getCoverage()
    expect(coverage.domain).toBe('Cart')
    expect(coverage.actions.called).toEqual(['addItem'])
    expect(coverage.queries.called).toEqual(['total'])
    expect(coverage.assertions.called).toEqual([])
    expect(coverage.percentage).toBe(67) // 2 of 3 operations

    await s.teardown()
  })

  it('tracks coverage across multiple calls without duplicates', async () => {
    const s = suite(cart, cartAdapter)
    await s.setup()

    await s.act.addItem({ name: 'A' })
    await s.act.addItem({ name: 'B' })
    await s.query.total()

    const coverage = s.getCoverage()
    expect(coverage.actions.called).toEqual(['addItem'])
    expect(coverage.percentage).toBe(67) // still 2 of 3

    await s.teardown()
  })
})

describe('suite().test() — callback API', () => {
  const { test: suiteTest, it: suiteIt, describe: suiteDescribe, context: suiteContext } = suite(cart, cartAdapter)

  suiteTest('dispatches through callback domain proxy', async ({ act }) => {
    await act.addItem({ name: 'Callback' })
    // If this runs without error, setup/teardown and dispatch worked
  })

  suiteTest('provides trace in callback', async ({ act, query, trace }) => {
    await act.addItem({ name: 'Traced' })
    await query.total()
    const t = trace()
    expect(t).toHaveLength(2)
    expect(t[0]).toMatchObject({ kind: 'action', category: 'act', name: 'addItem', status: 'pass' })
    expect(t[1]).toMatchObject({ kind: 'query', category: 'query', name: 'total', status: 'pass' })
  })

  suiteTest('given/when/then aliases dispatch through correct handlers with categories', async ({ given, when, then, assert, trace }) => {
    await given.addItem({ name: 'Setup' })
    await when.addItem({ name: 'Trigger' })
    await then.isEmpty()
    const t = trace()
    expect(t).toHaveLength(3)
    expect(t[0]).toMatchObject({ kind: 'action', category: 'given', name: 'addItem', payload: { name: 'Setup' } })
    expect(t[1]).toMatchObject({ kind: 'action', category: 'when', name: 'addItem', payload: { name: 'Trigger' } })
    expect(t[2]).toMatchObject({ kind: 'assertion', category: 'then', name: 'isEmpty' })
  })

  it('exposes alias helpers and modifiers', async () => {
    expect(suiteIt).toBe(suiteTest)
    expect(typeof suiteDescribe).toBe('function')
    expect(typeof suiteContext).toBe('function')
    expect(typeof (suiteTest as any).only).toBe('function')
    expect(typeof (suiteTest as any).skip).toBe('function')
    expect(typeof (suiteTest as any).each).toBe('function')
  })
})

describe('suite() — test modifier chains', () => {
  const originalTest = (globalThis as any).test
  const originalIt = (globalThis as any).it

  afterEach(() => {
    if (originalTest) (globalThis as any).test = originalTest
    else delete (globalThis as any).test
    if (originalIt) (globalThis as any).it = originalIt
    else delete (globalThis as any).it
    resetRegistry()
  })

  function createFakeTest() {
    const calls: Array<{ name: string; modifier?: string }> = []
    const fakeTest: any = (name: string, _fn: any) => { calls.push({ name }) }
    fakeTest.skip = (name: string, _fn: any) => { calls.push({ name, modifier: 'skip' }) }
    fakeTest.only = (name: string, _fn: any) => { calls.push({ name, modifier: 'only' }) }
    fakeTest.todo = (name: string) => { calls.push({ name, modifier: 'todo' }) }
    fakeTest.fails = (name: string, _fn: any) => { calls.push({ name, modifier: 'fails' }) }
    fakeTest.concurrent = Object.assign(
      (name: string, _fn: any) => { calls.push({ name, modifier: 'concurrent' }) },
      {
        skip: (name: string, _fn: any) => { calls.push({ name, modifier: 'concurrent.skip' }) },
        only: (name: string, _fn: any) => { calls.push({ name, modifier: 'concurrent.only' }) },
      },
    )
    fakeTest.sequential = (name: string, _fn: any) => { calls.push({ name, modifier: 'sequential' }) }
    fakeTest.each = (cases: any[]) => {
      return (name: string, _fn: any) => {
        for (const c of cases) {
          calls.push({ name: `${name} [${c}]`, modifier: 'each' })
        }
      }
    }
    fakeTest.skipIf = (condition: any) => {
      if (condition) return fakeTest.skip
      return fakeTest
    }
    fakeTest.runIf = (condition: any) => {
      if (condition) return fakeTest
      return fakeTest.skip
    }
    return { fakeTest, calls }
  }

  it('test.skip registers via skip modifier', () => {
    const { fakeTest, calls } = createFakeTest()
    ;(globalThis as any).test = fakeTest
    registerAdapter(cartAdapter)
    const { test: suiteTest } = suite(cart)
    ;(suiteTest as any).skip('skipped test', async () => {})
    expect(calls).toEqual([{ name: 'skipped test', modifier: 'skip' }])
  })

  it('test.only registers via only modifier', () => {
    const { fakeTest, calls } = createFakeTest()
    ;(globalThis as any).test = fakeTest
    registerAdapter(cartAdapter)
    const { test: suiteTest } = suite(cart)
    ;(suiteTest as any).only('focused test', async () => {})
    expect(calls).toEqual([{ name: 'focused test', modifier: 'only' }])
  })

  it('test.todo registers without a body', () => {
    const { fakeTest, calls } = createFakeTest()
    ;(globalThis as any).test = fakeTest
    registerAdapter(cartAdapter)
    const { test: suiteTest } = suite(cart)
    ;(suiteTest as any).todo('future test')
    expect(calls).toEqual([{ name: 'future test', modifier: 'todo' }])
  })

  it('test.each registers parameterized tests', () => {
    const { fakeTest, calls } = createFakeTest()
    ;(globalThis as any).test = fakeTest
    registerAdapter(cartAdapter)
    const { test: suiteTest } = suite(cart)
    ;(suiteTest as any).each(['a', 'b'])('test %s', async () => {})
    expect(calls).toEqual([
      { name: 'test %s [a]', modifier: 'each' },
      { name: 'test %s [b]', modifier: 'each' },
    ])
  })

  it('test.skipIf(true) delegates to skip', () => {
    const { fakeTest, calls } = createFakeTest()
    ;(globalThis as any).test = fakeTest
    registerAdapter(cartAdapter)
    const { test: suiteTest } = suite(cart)
    ;(suiteTest as any).skipIf(true)('conditional test', async () => {})
    expect(calls).toEqual([{ name: 'conditional test', modifier: 'skip' }])
  })

  it('test.skipIf(false) delegates to normal test', () => {
    const { fakeTest, calls } = createFakeTest()
    ;(globalThis as any).test = fakeTest
    registerAdapter(cartAdapter)
    const { test: suiteTest } = suite(cart)
    ;(suiteTest as any).skipIf(false)('conditional test', async () => {})
    expect(calls).toEqual([{ name: 'conditional test' }])
  })

  it('test.concurrent registers via concurrent modifier', () => {
    const { fakeTest, calls } = createFakeTest()
    ;(globalThis as any).test = fakeTest
    registerAdapter(cartAdapter)
    const { test: suiteTest } = suite(cart)
    ;(suiteTest as any).concurrent('concurrent test', async () => {})
    expect(calls).toEqual([{ name: 'concurrent test', modifier: 'concurrent' }])
  })

  it('test.concurrent.skip chains correctly', () => {
    const { fakeTest, calls } = createFakeTest()
    ;(globalThis as any).test = fakeTest
    registerAdapter(cartAdapter)
    const { test: suiteTest } = suite(cart)
    ;(suiteTest as any).concurrent.skip('chained test', async () => {})
    expect(calls).toEqual([{ name: 'chained test', modifier: 'concurrent.skip' }])
  })

  it('undefined modifiers return undefined (Jest compat)', () => {
    const { fakeTest } = createFakeTest()
    delete fakeTest.concurrent
    delete fakeTest.skipIf
    ;(globalThis as any).test = fakeTest
    registerAdapter(cartAdapter)
    const { test: suiteTest } = suite(cart)
    expect((suiteTest as any).concurrent).toBeUndefined()
    expect((suiteTest as any).skipIf).toBeUndefined()
  })

  it('named config suite test.skipIf delegates correctly', () => {
    const { fakeTest, calls } = createFakeTest()
    ;(globalThis as any).test = fakeTest
    const config = { cart: [cart, cartAdapter] as const }
    const { test: namedTest } = suite(config)
    ;(namedTest as any).skipIf(true)('skipped', async () => {})
    expect(calls).toEqual([{ name: 'skipped', modifier: 'skip' }])
  })

  it('named config suite test.runIf delegates correctly', () => {
    const { fakeTest, calls } = createFakeTest()
    ;(globalThis as any).test = fakeTest
    const config = { cart: [cart, cartAdapter] as const }
    const { test: namedTest } = suite(config)
    ;(namedTest as any).runIf(false)('skipped', async () => {})
    expect(calls).toEqual([{ name: 'skipped', modifier: 'skip' }])
  })
})

describe('suite() — domain filtering', () => {
  const originalTest = (globalThis as any).test
  const originalIt = (globalThis as any).it

  afterEach(() => {
    if (originalTest) (globalThis as any).test = originalTest
    if (originalIt) (globalThis as any).it = originalIt
    delete process.env.AVER_DOMAIN
  })

  it('skips tests when AVER_DOMAIN does not match', () => {
    const calls: string[] = []
    const skipCalls: string[] = []
    const fakeTest = (name: string, _fn: any) => { calls.push(name) }
    fakeTest.skip = (name: string, _fn: any) => { skipCalls.push(name) }

    ;(globalThis as any).test = fakeTest
    const { test: suiteTest } = suite(cart, cartAdapter)

    process.env.AVER_DOMAIN = 'OtherDomain'
    suiteTest('filtered test', async () => {})

    expect(calls).toHaveLength(0)
    expect(skipCalls).toEqual(['filtered test'])
  })

  it('registers tests when AVER_DOMAIN matches', () => {
    const calls: string[] = []
    const skipCalls: string[] = []
    const fakeTest = (name: string, _fn: any) => { calls.push(name) }
    fakeTest.skip = (name: string, _fn: any) => { skipCalls.push(name) }

    ;(globalThis as any).test = fakeTest
    const { test: suiteTest } = suite(cart, cartAdapter)

    process.env.AVER_DOMAIN = 'Cart'
    suiteTest('allowed test', async () => {})

    expect(calls).toEqual(['allowed test'])
    expect(skipCalls).toHaveLength(0)
  })
})

describe('suite() — failure artifacts', () => {
  const originalTest = (globalThis as any).test
  const originalIt = (globalThis as any).it

  afterEach(() => {
    if (originalTest) (globalThis as any).test = originalTest
    if (originalIt) (globalThis as any).it = originalIt
  })

  it('records artifacts from onTestFail in trace', async () => {
    let pending: Promise<void> | undefined
    let lastTrace: any[] = []

    const fakeTest = (name: string, fn: () => Promise<void>) => {
      pending = fn()
      return pending
    }
    fakeTest.skip = () => {}
    ;(globalThis as any).test = fakeTest

    const failDomain = defineDomain({
      name: 'Artifacts',
      actions: {},
      queries: {},
      assertions: { boom: assertion() },
    })

    const protocol: Protocol<{}> = {
      name: 'artifact-proto',
      async setup() { return {} },
      async teardown() {},
      async onTestFail() {
        return [{ name: 'log', path: '/tmp/failure.log', mime: 'text/plain' }]
      },
      async onTestEnd(_ctx, meta) {
        lastTrace = meta.trace
      },
    }

    const adapter = implement(failDomain, {
      protocol,
      actions: {},
      queries: {},
      assertions: { boom: async () => { throw new Error('boom') } },
    })

    const { test: suiteTest } = suite(failDomain, adapter)
    suiteTest('captures artifacts', async ({ assert }) => {
      await assert.boom()
    })

    let caught: any
    await pending!.catch(e => { caught = e })
    expect(caught).toBeDefined()

    const artifactEntry = lastTrace.find(e => e.kind === 'test' && e.attachments?.length)
    expect(artifactEntry).toBeDefined()
    expect(artifactEntry.attachments[0]).toMatchObject({ name: 'log', path: '/tmp/failure.log' })
  })

  it('includes protocol name in trace header on failure', async () => {
    let pending: Promise<void> | undefined

    const fakeTest = (name: string, fn: () => Promise<void>) => {
      pending = fn()
      return pending
    }
    fakeTest.skip = () => {}
    ;(globalThis as any).test = fakeTest

    const failDomain = defineDomain({
      name: 'Proto',
      actions: { go: action() },
      queries: {},
      assertions: {},
    })
    const adapter = implement(failDomain, {
      protocol: testProtocol,
      actions: { go: async () => { throw new Error('boom') } },
      queries: {},
      assertions: {},
    })

    const { test: suiteTest } = suite(failDomain, adapter)
    suiteTest('proto trace', async ({ act }) => {
      await act.go()
    })

    let caught: any
    await pending!.catch(e => { caught = e })
    expect(caught).toBeDefined()
    expect(caught.message).toContain('Action trace (test):')
  })
})

describe('suite() — vocabulary coverage in callback API', () => {
  const originalTest = (globalThis as any).test
  const originalIt = (globalThis as any).it

  afterEach(() => {
    if (originalTest) (globalThis as any).test = originalTest
    if (originalIt) (globalThis as any).it = originalIt
  })

  it('accumulates coverage across callback tests', async () => {
    let pending1: Promise<void> | undefined
    let pending2: Promise<void> | undefined
    let callIdx = 0

    const fakeTest = (name: string, fn: () => Promise<void>) => {
      if (callIdx === 0) pending1 = fn()
      else pending2 = fn()
      callIdx++
    }
    fakeTest.skip = () => {}
    ;(globalThis as any).test = fakeTest

    const s = suite(cart, cartAdapter)
    s.test('test 1', async ({ act }) => {
      await act.addItem({ name: 'A' })
    })
    s.test('test 2', async ({ query }) => {
      await query.total()
    })

    await pending1
    await pending2

    const coverage = s.getCoverage()
    expect(coverage.actions.called).toEqual(['addItem'])
    expect(coverage.queries.called).toEqual(['total'])
    expect(coverage.assertions.called).toEqual([])
    expect(coverage.percentage).toBe(67)
  })
})

describe('suite() — getPlannedTests()', () => {
  beforeEach(() => {
    resetRegistry()
    delete process.env.AVER_DOMAIN
  })

  afterEach(() => {
    delete process.env.AVER_DOMAIN
  })

  it('returns single test name for single adapter', () => {
    const s = suite(cart, cartAdapter) as ReturnType<typeof suite> & SuiteInternals
    const planned = s.getPlannedTests('add item')
    expect(planned).toEqual([
      { name: 'add item', status: 'register' },
    ])
  })

  it('returns parameterized names for multiple adapters', () => {
    const httpProtocol: Protocol<null> = {
      name: 'http',
      async setup() { return null },
      async teardown() {},
    }
    const httpAdapter = implement(cart, {
      protocol: httpProtocol,
      actions: { addItem: async () => {} },
      queries: { total: async () => 0 },
      assertions: { isEmpty: async () => {} },
    })

    registerAdapter(cartAdapter)
    registerAdapter(httpAdapter)
    const s = suite(cart) as ReturnType<typeof suite> & SuiteInternals

    const planned = s.getPlannedTests('add item')
    expect(planned).toEqual([
      { name: 'add item [test]', status: 'register' },
      { name: 'add item [http]', status: 'register' },
    ])
  })

  it('returns skip status when AVER_DOMAIN does not match', () => {
    process.env.AVER_DOMAIN = 'OtherDomain'
    const s = suite(cart, cartAdapter) as ReturnType<typeof suite> & SuiteInternals
    const planned = s.getPlannedTests('add item')
    expect(planned).toEqual([
      { name: 'add item', status: 'skip' },
    ])
  })

  it('returns register status when AVER_DOMAIN matches', () => {
    process.env.AVER_DOMAIN = 'Cart'
    const s = suite(cart, cartAdapter) as ReturnType<typeof suite> & SuiteInternals
    const planned = s.getPlannedTests('add item')
    expect(planned).toEqual([
      { name: 'add item', status: 'register' },
    ])
  })
})

describe('suite() — teardown error handling', () => {
  const originalTest = (globalThis as any).test
  const originalIt = (globalThis as any).it

  afterEach(() => {
    if (originalTest) (globalThis as any).test = originalTest
    if (originalIt) (globalThis as any).it = originalIt
    resetAll()
  })

  it('does not replace original test error when teardown throws', async () => {
    let pending: Promise<void> | undefined

    const fakeTest = (name: string, fn: () => Promise<void>) => {
      pending = fn()
      return pending
    }
    fakeTest.skip = () => {}
    ;(globalThis as any).test = fakeTest

    const failDomain = defineDomain({
      name: 'TeardownFail',
      actions: { go: action() },
      queries: {},
      assertions: {},
    })
    const protocol: Protocol<{}> = {
      name: 'teardown-failing',
      async setup() { return {} },
      async teardown() { throw new Error('teardown boom') },
    }
    const adapter = implement(failDomain, {
      protocol,
      actions: { go: async () => { throw new Error('original error') } },
      queries: {},
      assertions: {},
    })

    const { test: suiteTest } = suite(failDomain, adapter)
    suiteTest('teardown test', async ({ act }) => {
      await act.go()
    })

    let caught: any
    await pending!.catch(e => { caught = e })
    expect(caught).toBeDefined()
    expect(caught.message).toContain('original error')
  })

  it('fails the test when teardown throws and test body passed (default)', async () => {
    let pending: Promise<void> | undefined

    const fakeTest = (name: string, fn: () => Promise<void>) => {
      pending = fn()
      return pending
    }
    fakeTest.skip = () => {}
    ;(globalThis as any).test = fakeTest

    const okDomain = defineDomain({
      name: 'TeardownFailDefault',
      actions: {},
      queries: {},
      assertions: { check: assertion() },
    })
    const protocol: Protocol<{}> = {
      name: 'teardown-fail-default',
      async setup() { return {} },
      async teardown() { throw new Error('teardown boom') },
    }
    const adapter = implement(okDomain, {
      protocol,
      actions: {},
      queries: {},
      assertions: { check: async () => {} },
    })

    const { test: suiteTest } = suite(okDomain, adapter)
    suiteTest('passing test with bad teardown', async ({ assert }) => {
      await assert.check()
    })

    let caught: any
    await pending!.catch(e => { caught = e })
    expect(caught).toBeDefined()
    expect(caught.message).toContain('teardown boom')
  })

  it('only warns when teardownFailureMode is "warn"', async () => {
    let pending: Promise<void> | undefined

    const fakeTest = (name: string, fn: () => Promise<void>) => {
      pending = fn()
      return pending
    }
    fakeTest.skip = () => {}
    ;(globalThis as any).test = fakeTest

    const okDomain = defineDomain({
      name: 'TeardownWarn',
      actions: {},
      queries: {},
      assertions: { check: assertion() },
    })
    const protocol: Protocol<{}> = {
      name: 'teardown-warn',
      async setup() { return {} },
      async teardown() { throw new Error('teardown boom') },
    }
    const adapter = implement(okDomain, {
      protocol,
      actions: {},
      queries: {},
      assertions: { check: async () => {} },
    })

    defineConfig({ adapters: [adapter], teardownFailureMode: 'warn' })

    const { test: suiteTest } = suite(okDomain, adapter)
    suiteTest('passing test with bad teardown', async ({ assert }) => {
      await assert.check()
    })

    // Test should pass — teardown error is recorded but not thrown
    await pending
  })

  it('includes teardown error in trace on failure', async () => {
    let pending: Promise<void> | undefined

    const fakeTest = (name: string, fn: () => Promise<void>) => {
      pending = fn()
      return pending
    }
    fakeTest.skip = () => {}
    ;(globalThis as any).test = fakeTest

    const okDomain = defineDomain({
      name: 'TeardownTraceCheck',
      actions: {},
      queries: {},
      assertions: { check: assertion() },
    })
    const protocol: Protocol<{}> = {
      name: 'teardown-trace-check',
      async setup() { return {} },
      async teardown() { throw new Error('teardown boom') },
    }
    const adapter = implement(okDomain, {
      protocol,
      actions: {},
      queries: {},
      assertions: { check: async () => {} },
    })

    const { test: suiteTest } = suite(okDomain, adapter)
    suiteTest('trace includes teardown error', async ({ assert }) => {
      await assert.check()
    })

    let caught: any
    await pending!.catch(e => { caught = e })
    expect(caught).toBeDefined()
    expect(caught.message).toContain('teardown-error')
  })
})

describe('suite() — hook error tracing', () => {
  const originalTest = (globalThis as any).test
  const originalIt = (globalThis as any).it

  afterEach(() => {
    if (originalTest) (globalThis as any).test = originalTest
    if (originalIt) (globalThis as any).it = originalIt
  })

  it('records onTestFail hook error in trace', async () => {
    let pending: Promise<void> | undefined
    let lastTrace: any[] = []

    const fakeTest = (name: string, fn: () => Promise<void>) => {
      pending = fn()
      return pending
    }
    fakeTest.skip = () => {}
    ;(globalThis as any).test = fakeTest

    const failDomain = defineDomain({
      name: 'HookFail',
      actions: {},
      queries: {},
      assertions: { boom: assertion() },
    })

    const protocol: Protocol<{}> = {
      name: 'hook-fail-proto',
      async setup() { return {} },
      async teardown() {},
      async onTestFail() {
        throw new Error('onTestFail hook broke')
      },
      async onTestEnd(_ctx, meta) {
        lastTrace = meta.trace
      },
    }

    const adapter = implement(failDomain, {
      protocol,
      actions: {},
      queries: {},
      assertions: { boom: async () => { throw new Error('assertion error') } },
    })

    const { test: suiteTest } = suite(failDomain, adapter)
    suiteTest('hook fail test', async ({ assert }) => {
      await assert.boom()
    })

    let caught: any
    await pending!.catch(e => { caught = e })
    expect(caught).toBeDefined()
    // Original error should be preserved
    expect(caught.message).toContain('assertion error')
    // Hook error should be in trace
    const hookEntry = lastTrace.find(e => e.name === 'hook-error:onTestFail')
    expect(hookEntry).toBeDefined()
    expect(hookEntry.status).toBe('fail')
    expect((hookEntry.error as Error).message).toBe('onTestFail hook broke')
  })

  it('records onTestEnd hook error in trace', async () => {
    let pending: Promise<void> | undefined

    const fakeTest = (name: string, fn: () => Promise<void>) => {
      pending = fn()
      return pending
    }
    fakeTest.skip = () => {}
    ;(globalThis as any).test = fakeTest

    const failDomain = defineDomain({
      name: 'HookEndFail',
      actions: {},
      queries: {},
      assertions: { boom: assertion() },
    })

    const protocol: Protocol<{}> = {
      name: 'hook-end-fail-proto',
      async setup() { return {} },
      async teardown() {},
      async onTestEnd() {
        throw new Error('onTestEnd hook broke')
      },
    }

    const adapter = implement(failDomain, {
      protocol,
      actions: {},
      queries: {},
      assertions: { boom: async () => { throw new Error('assertion error') } },
    })

    const { test: suiteTest } = suite(failDomain, adapter)
    suiteTest('hook end fail test', async ({ assert }) => {
      await assert.boom()
    })

    let caught: any
    await pending!.catch(e => { caught = e })
    expect(caught).toBeDefined()
    // Original error should be preserved
    expect(caught.message).toContain('assertion error')
  })
})

describe('getAdapters()', () => {
  beforeEach(() => {
    resetRegistry()
  })

  it('returns empty array when no adapters registered', () => {
    expect(getAdapters()).toEqual([])
  })

  it('returns all registered adapters', () => {
    registerAdapter(cartAdapter)
    const adapters = getAdapters()
    expect(adapters).toHaveLength(1)
    expect(adapters[0].domain).toBe(cart)
  })

  it('returns a copy, not the internal array', () => {
    registerAdapter(cartAdapter)
    const a1 = getAdapters()
    const a2 = getAdapters()
    expect(a1).not.toBe(a2)
    expect(a1).toEqual(a2)
  })
})

describe('suite() — domain without queries', () => {
  beforeEach(() => {
    resetRegistry()
    calls.length = 0
  })

  it('works end-to-end with a domain that omits queries', async () => {
    const actionOnlyDomain = defineDomain({
      name: 'ActionOnly',
      actions: {
        fire: action(),
      },
      queries: {},
      assertions: {
        fired: assertion(),
      },
    })

    let fired = false
    const actionOnlyAdapter = implement(actionOnlyDomain, {
      protocol: testProtocol,
      actions: {
        fire: async () => { fired = true },
      },
      assertions: {
        fired: async () => {
          if (!fired) throw new Error('fire() was not called')
        },
      },
    })

    const s = suite(actionOnlyDomain, actionOnlyAdapter)
    await s.setup()

    await s.act.fire()
    await s.assert.fired()

    expect(fired).toBe(true)
    expect(s.getCoverage().percentage).toBe(100)

    await s.teardown()
  })
})
