import { describe, it, expect, vi, afterEach } from 'vitest'
import { runTest, runTestWithAdapter } from '../../src/core/test-runner'
import { defineDomain } from '../../src/core/domain'
import { adapt } from '../../src/core/adapter'
import { action, query, assertion } from '../../src/core/markers'
import type { Protocol } from '../../src/core/protocol'
import type { TraceAttachment } from '../../src/core/trace'
import * as config from '../../src/core/config'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDomain(name: string) {
  return defineDomain({
    name,
    actions: { doSomething: action<{ val: string }>() },
    queries: { count: query<number>() },
    assertions: { check: assertion<{ val: string }>() },
  })
}

function makeProtocol(name: string, log: string[]): Protocol<{ log: string[] }> {
  return {
    name,
    async setup() { log.push(`setup:${name}`); return { log } },
    async teardown() { log.push(`teardown:${name}`) },
    async onTestStart() { log.push(`onTestStart:${name}`) },
    async onTestEnd() { log.push(`onTestEnd:${name}`) },
    async onTestFail() { log.push(`onTestFail:${name}`) },
  }
}

function makeAdapter(domain: ReturnType<typeof makeDomain>, protocol: Protocol<any>, log: string[]) {
  return adapt(domain, {
    protocol,
    actions: { doSomething: async (ctx, { val }) => { log.push(`action:${val}`) } },
    queries: { count: async () => 42 },
    assertions: { check: async () => {} },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runTest (generalized)', () => {
  describe('single adapter (backward compat)', () => {
    it('runs the test body and calls setup/teardown', async () => {
      const log: string[] = []
      const domain = makeDomain('Single')
      const proto = makeProtocol('p1', log)
      const adapter = makeAdapter(domain, proto, log)

      await runTest(
        [['single', domain, adapter]],
        'test-name',
        async (ctx) => {
          await ctx.act.doSomething({ val: 'hello' })
        },
      )

      expect(log).toContain('setup:p1')
      expect(log).toContain('action:hello')
      expect(log).toContain('teardown:p1')
    })

    it('provides act/given/when/query/assert/then/trace on context', async () => {
      const log: string[] = []
      const domain = makeDomain('CTX')
      const proto = makeProtocol('p1', log)
      const adapter = makeAdapter(domain, proto, log)

      await runTest(
        [['ctx', domain, adapter]],
        'ctx-test',
        async (ctx) => {
          expect(ctx.act).toBeDefined()
          expect(ctx.given).toBeDefined()
          expect(ctx.when).toBeDefined()
          expect(ctx.query).toBeDefined()
          expect(ctx.assert).toBeDefined()
          expect(ctx.then).toBeDefined()
          expect(ctx.trace).toBeTypeOf('function')
        },
      )
    })

    it('calls onTestStart before body and onTestEnd after', async () => {
      const log: string[] = []
      const domain = makeDomain('Hooks')
      const proto = makeProtocol('p1', log)
      const adapter = makeAdapter(domain, proto, log)

      await runTest(
        [['hooks', domain, adapter]],
        'hooks-test',
        async () => { log.push('body') },
      )

      const startIdx = log.indexOf('onTestStart:p1')
      const bodyIdx = log.indexOf('body')
      const endIdx = log.indexOf('onTestEnd:p1')
      expect(startIdx).toBeLessThan(bodyIdx)
      expect(bodyIdx).toBeLessThan(endIdx)
    })

    it('calls onTestFail on error', async () => {
      const log: string[] = []
      const domain = makeDomain('FailHook')
      const proto = makeProtocol('p1', log)
      const adapter = makeAdapter(domain, proto, log)

      await expect(
        runTest(
          [['fail', domain, adapter]],
          'fail-test',
          async () => { throw new Error('boom') },
        ),
      ).rejects.toThrow('boom')

      expect(log).toContain('onTestFail:p1')
      expect(log).toContain('teardown:p1')
    })
  })

  describe('multiple adapters', () => {
    it('sets up all adapters before body, tears down in reverse after', async () => {
      const log: string[] = []
      const d1 = makeDomain('D1')
      const d2 = makeDomain('D2')
      const d3 = makeDomain('D3')
      const p1 = makeProtocol('p1', log)
      const p2 = makeProtocol('p2', log)
      const p3 = makeProtocol('p3', log)
      const a1 = makeAdapter(d1, p1, log)
      const a2 = makeAdapter(d2, p2, log)
      const a3 = makeAdapter(d3, p3, log)

      await runTest(
        [['ns1', d1, a1], ['ns2', d2, a2], ['ns3', d3, a3]],
        'multi-test',
        async () => { log.push('body') },
      )

      expect(log).toEqual([
        'setup:p1', 'setup:p2', 'setup:p3',
        'onTestStart:p1', 'onTestStart:p2', 'onTestStart:p3',
        'body',
        'onTestEnd:p1', 'onTestEnd:p2', 'onTestEnd:p3',
        'teardown:p3', 'teardown:p2', 'teardown:p1',
      ])
    })

    it('partial teardown on setup failure: adapters 0..N-1 torn down in reverse', async () => {
      const log: string[] = []
      const d1 = makeDomain('D1')
      const d2 = makeDomain('D2')
      const d3 = makeDomain('D3')

      const p1 = makeProtocol('p1', log)
      const p2: Protocol<null> = {
        name: 'p2',
        async setup() { log.push('setup:p2'); return null },
        async teardown() { log.push('teardown:p2') },
      }
      const p3: Protocol<null> = {
        name: 'p3',
        async setup() { throw new Error('setup failed') },
        async teardown() { log.push('teardown:p3') },
      }

      const a1 = makeAdapter(d1, p1, log)
      const a2 = adapt(d2, { protocol: p2, actions: { doSomething: async () => {} }, queries: { count: async () => 0 }, assertions: { check: async () => {} } })
      const a3 = adapt(d3, { protocol: p3, actions: { doSomething: async () => {} }, queries: { count: async () => 0 }, assertions: { check: async () => {} } })

      await expect(
        runTest(
          [['ns1', d1, a1], ['ns2', d2, a2], ['ns3', d3, a3]],
          'partial-setup',
          async () => {},
        ),
      ).rejects.toThrow('setup failed')

      // p3 setup failed, so only p1 and p2 should be torn down, in reverse
      expect(log).toEqual([
        'setup:p1', 'setup:p2',
        'teardown:p2', 'teardown:p1',
      ])
    })

    it('calls onTestFail for ALL adapters on failure', async () => {
      const log: string[] = []
      const d1 = makeDomain('D1')
      const d2 = makeDomain('D2')
      const p1 = makeProtocol('p1', log)
      const p2 = makeProtocol('p2', log)
      const a1 = makeAdapter(d1, p1, log)
      const a2 = makeAdapter(d2, p2, log)

      await expect(
        runTest(
          [['ns1', d1, a1], ['ns2', d2, a2]],
          'multi-fail',
          async () => { throw new Error('boom') },
        ),
      ).rejects.toThrow('boom')

      expect(log).toContain('onTestFail:p1')
      expect(log).toContain('onTestFail:p2')
    })

    it('collects attachments from all adapters on failure', async () => {
      const d1 = makeDomain('D1')
      const d2 = makeDomain('D2')
      const attachments1: TraceAttachment[] = [{ name: 'screenshot', path: '/tmp/a.png' }]
      const attachments2: TraceAttachment[] = [{ name: 'log', path: '/tmp/b.log' }]

      const p1: Protocol<null> = {
        name: 'p1',
        async setup() { return null },
        async teardown() {},
        async onTestFail() { return attachments1 },
      }
      const p2: Protocol<null> = {
        name: 'p2',
        async setup() { return null },
        async teardown() {},
        async onTestFail() { return attachments2 },
      }

      const a1 = adapt(d1, { protocol: p1, actions: { doSomething: async () => {} }, queries: { count: async () => 0 }, assertions: { check: async () => {} } })
      const a2 = adapt(d2, { protocol: p2, actions: { doSomething: async () => {} }, queries: { count: async () => 0 }, assertions: { check: async () => {} } })

      let caughtError: Error | undefined
      try {
        await runTest(
          [['ns1', d1, a1], ['ns2', d2, a2]],
          'attachment-test',
          async ({ ns1 }) => {
            await (ns1 as any).act.doSomething({ val: 'x' })
            throw new Error('fail')
          },
        )
      } catch (e) {
        caughtError = e as Error
      }

      expect(caughtError).toBeDefined()
      expect(caughtError!.message).toContain('Action trace')
    })

    it('error includes all protocol names in composed failures', async () => {
      const d1 = makeDomain('D1')
      const d2 = makeDomain('D2')
      const p1: Protocol<null> = { name: 'proto-alpha', async setup() { return null }, async teardown() {} }
      const p2: Protocol<null> = { name: 'proto-beta', async setup() { return null }, async teardown() {} }
      const a1 = adapt(d1, { protocol: p1, actions: { doSomething: async () => {} }, queries: { count: async () => 0 }, assertions: { check: async () => {} } })
      const a2 = adapt(d2, { protocol: p2, actions: { doSomething: async () => {} }, queries: { count: async () => 0 }, assertions: { check: async () => {} } })

      let caughtError: Error | undefined
      try {
        await runTest(
          [['ns1', d1, a1], ['ns2', d2, a2]],
          'proto-names',
          async ({ ns1 }) => {
            await (ns1 as any).act.doSomething({ val: 'x' })
            throw new Error('test error')
          },
        )
      } catch (e) {
        caughtError = e as Error
      }

      expect(caughtError).toBeDefined()
      expect(caughtError!.message).toContain('proto-alpha')
      expect(caughtError!.message).toContain('proto-beta')
    })

    it('multi-adapter context has named keys', async () => {
      const d1 = makeDomain('D1')
      const d2 = makeDomain('D2')
      const p1: Protocol<null> = { name: 'p1', async setup() { return null }, async teardown() {} }
      const p2: Protocol<null> = { name: 'p2', async setup() { return null }, async teardown() {} }
      const a1 = adapt(d1, { protocol: p1, actions: { doSomething: async () => {} }, queries: { count: async () => 0 }, assertions: { check: async () => {} } })
      const a2 = adapt(d2, { protocol: p2, actions: { doSomething: async () => {} }, queries: { count: async () => 0 }, assertions: { check: async () => {} } })

      await runTest(
        [['alpha', d1, a1], ['beta', d2, a2]],
        'named-keys',
        async (ctx) => {
          expect(ctx.alpha).toBeDefined()
          expect(ctx.beta).toBeDefined()
          expect(ctx.alpha.act).toBeDefined()
          expect(ctx.beta.query).toBeDefined()
          expect(ctx.trace).toBeTypeOf('function')
        },
      )
    })

    it('trace entries carry domainName per adapter', async () => {
      const d1 = makeDomain('DomA')
      const d2 = makeDomain('DomB')
      const log: string[] = []
      const p1 = makeProtocol('p1', log)
      const p2 = makeProtocol('p2', log)
      const a1 = makeAdapter(d1, p1, log)
      const a2 = makeAdapter(d2, p2, log)

      let capturedTrace: any[] = []
      await runTest(
        [['ns1', d1, a1], ['ns2', d2, a2]],
        'trace-domain',
        async (ctx) => {
          await ctx.ns1.act.doSomething({ val: 'x' })
          await ctx.ns2.act.doSomething({ val: 'y' })
          capturedTrace = ctx.trace()
        },
      )

      expect(capturedTrace).toHaveLength(2)
      expect(capturedTrace[0].domainName).toBe('DomA')
      expect(capturedTrace[1].domainName).toBe('DomB')
    })
  })

  describe('teardownFailureMode', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('fails test when teardown throws and mode is "fail"', async () => {
      vi.spyOn(config, 'getTeardownFailureMode').mockReturnValue('fail')

      const d = makeDomain('TD')
      const p: Protocol<null> = {
        name: 'p1',
        async setup() { return null },
        async teardown() { throw new Error('teardown boom') },
      }
      const a = adapt(d, { protocol: p, actions: { doSomething: async () => {} }, queries: { count: async () => 0 }, assertions: { check: async () => {} } })

      await expect(
        runTest([['td', d, a]], 'teardown-fail', async () => {}),
      ).rejects.toThrow('teardown boom')
    })

    it('does not fail test when teardown throws and mode is "warn"', async () => {
      vi.spyOn(config, 'getTeardownFailureMode').mockReturnValue('warn')

      const d = makeDomain('TD')
      const p: Protocol<null> = {
        name: 'p1',
        async setup() { return null },
        async teardown() { throw new Error('teardown boom') },
      }
      const a = adapt(d, { protocol: p, actions: { doSomething: async () => {} }, queries: { count: async () => 0 }, assertions: { check: async () => {} } })

      await expect(
        runTest([['td', d, a]], 'teardown-warn', async () => {}),
      ).resolves.toBeUndefined()
    })

    it('teardownFailureMode applies to each adapter in multi-adapter', async () => {
      vi.spyOn(config, 'getTeardownFailureMode').mockReturnValue('fail')

      const d1 = makeDomain('TD1')
      const d2 = makeDomain('TD2')
      const p1: Protocol<null> = {
        name: 'p1',
        async setup() { return null },
        async teardown() {},
      }
      const p2: Protocol<null> = {
        name: 'p2',
        async setup() { return null },
        async teardown() { throw new Error('p2 teardown boom') },
      }
      const a1 = adapt(d1, { protocol: p1, actions: { doSomething: async () => {} }, queries: { count: async () => 0 }, assertions: { check: async () => {} } })
      const a2 = adapt(d2, { protocol: p2, actions: { doSomething: async () => {} }, queries: { count: async () => 0 }, assertions: { check: async () => {} } })

      await expect(
        runTest([['ns1', d1, a1], ['ns2', d2, a2]], 'td-multi', async () => {}),
      ).rejects.toThrow('p2 teardown boom')
    })
  })

  describe('runWithTestContext', () => {
    it('provides AsyncLocalStorage context during test body', async () => {
      const { getTestContext } = await import('../../src/core/test-context')
      const log: string[] = []
      const d = makeDomain('ALS')
      const p: Protocol<null> = {
        name: 'als-proto',
        async setup() { return null },
        async teardown() {},
        extensions: { customExt: 'value' },
      }
      const a = adapt(d, { protocol: p, actions: { doSomething: async () => {} }, queries: { count: async () => 0 }, assertions: { check: async () => {} } })

      await runTest(
        [['als', d, a]],
        'als-test',
        async () => {
          const ctx = getTestContext()
          expect(ctx).toBeDefined()
          expect(ctx!.testName).toBe('als-test')
          expect(ctx!.domainName).toBe('ALS')
          expect(ctx!.protocolName).toBe('als-proto')
          expect(ctx!.extensions).toEqual({ customExt: 'value' })
        },
      )
    })
  })
})

describe('runTestWithAdapter (wrapper)', () => {
  it('still works as before — backward compat', async () => {
    const log: string[] = []
    const domain = makeDomain('Compat')
    const proto = makeProtocol('p1', log)
    const adapter = makeAdapter(domain, proto, log)

    await runTestWithAdapter(
      adapter,
      domain,
      'compat-test',
      async (ctx) => {
        await ctx.act.doSomething({ val: 'compat' })
        const c = await ctx.query.count()
        expect(c).toBe(42)
      },
    )

    expect(log).toContain('setup:p1')
    expect(log).toContain('action:compat')
    expect(log).toContain('teardown:p1')
  })
})
