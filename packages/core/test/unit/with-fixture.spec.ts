import { describe, it, expect } from 'vitest'
import type { Protocol } from '../../src/core/protocol.js'
import { withFixture } from '../../src/core/protocol.js'

function mockProtocol(calls: string[]): Protocol<{ value: number }> {
  return {
    name: 'mock',
    async setup() {
      calls.push('setup')
      return { value: 1 }
    },
    async teardown() {
      calls.push('teardown')
    },
    async onTestStart() {
      calls.push('onTestStart')
    },
    async onTestFail() {
      calls.push('onTestFail')
    },
    async onTestEnd() {
      calls.push('onTestEnd')
    },
    extensions: { screenshotter: undefined, custom: 'ext' },
  }
}

describe('withFixture()', () => {
  it('runs before() before setup() and after() after teardown()', async () => {
    const calls: string[] = []
    const wrapped = withFixture(mockProtocol(calls), {
      before: async () => { calls.push('before') },
      after: async () => { calls.push('after') },
    })

    const ctx = await wrapped.setup()
    await wrapped.teardown(ctx)

    expect(calls).toEqual(['before', 'setup', 'teardown', 'after'])
  })

  it('runs afterSetup() after setup() with the context', async () => {
    const calls: string[] = []
    let receivedCtx: unknown
    const wrapped = withFixture(mockProtocol(calls), {
      before: async () => { calls.push('before') },
      afterSetup: async (ctx) => {
        calls.push('afterSetup')
        receivedCtx = ctx
      },
      after: async () => { calls.push('after') },
    })

    const ctx = await wrapped.setup()
    await wrapped.teardown(ctx)

    expect(calls).toEqual(['before', 'setup', 'afterSetup', 'teardown', 'after'])
    expect(receivedCtx).toEqual({ value: 1 })
  })

  it('works with only before', async () => {
    const calls: string[] = []
    const wrapped = withFixture(mockProtocol(calls), {
      before: async () => { calls.push('before') },
    })

    const ctx = await wrapped.setup()
    await wrapped.teardown(ctx)

    expect(calls).toEqual(['before', 'setup', 'teardown'])
  })

  it('works with only after', async () => {
    const calls: string[] = []
    const wrapped = withFixture(mockProtocol(calls), {
      after: async () => { calls.push('after') },
    })

    const ctx = await wrapped.setup()
    await wrapped.teardown(ctx)

    expect(calls).toEqual(['setup', 'teardown', 'after'])
  })

  it('delegates lifecycle hooks to the wrapped protocol', async () => {
    const calls: string[] = []
    const wrapped = withFixture(mockProtocol(calls), {})
    const ctx = await wrapped.setup()

    const meta = { testName: 't', domainName: 'd', adapterName: 'a', protocolName: 'p' }
    const completion = { ...meta, status: 'fail' as const, trace: [] }

    await wrapped.onTestStart!(ctx, meta)
    await wrapped.onTestFail!(ctx, completion)
    await wrapped.onTestEnd!(ctx, completion)

    expect(calls).toContain('onTestStart')
    expect(calls).toContain('onTestFail')
    expect(calls).toContain('onTestEnd')
  })

  it('preserves the protocol name', () => {
    const wrapped = withFixture(mockProtocol([]), {})
    expect(wrapped.name).toBe('mock')
  })

  it('passes through extensions', () => {
    const wrapped = withFixture(mockProtocol([]), {})
    expect(wrapped.extensions).toEqual({ screenshotter: undefined, custom: 'ext' })
  })

  it('calls after() even when teardown() throws', async () => {
    const calls: string[] = []
    const failing: Protocol<null> = {
      name: 'failing',
      async setup() { return null },
      async teardown() { throw new Error('teardown boom') },
    }
    const wrapped = withFixture(failing, {
      after: async () => { calls.push('after') },
    })

    const ctx = await wrapped.setup()
    await expect(wrapped.teardown(ctx)).rejects.toThrow('teardown boom')
    expect(calls).toContain('after')
  })

  it('preserves custom properties from the original protocol', () => {
    const server = { port: 3000 }
    const protocol = {
      ...mockProtocol([]),
      myServer: server,
    } as Protocol<{ value: number }> & { myServer: typeof server }
    const wrapped = withFixture(protocol, {}) as typeof protocol
    expect(wrapped.myServer).toBe(server)
  })

  it('preserves extra methods from the original protocol', async () => {
    const cleanup = async () => 'cleaned'
    const protocol = {
      ...mockProtocol([]),
      customCleanup: cleanup,
    } as Protocol<{ value: number }> & { customCleanup: typeof cleanup }
    const wrapped = withFixture(protocol, {}) as typeof protocol
    expect(wrapped.customCleanup).toBe(cleanup)
    expect(await wrapped.customCleanup()).toBe('cleaned')
  })

  it('handles protocol without optional hooks', async () => {
    const bare: Protocol<null> = {
      name: 'bare',
      async setup() { return null },
      async teardown() {},
    }
    const wrapped = withFixture(bare, {
      before: async () => {},
      after: async () => {},
    })

    expect(wrapped.onTestStart).toBeUndefined()
    expect(wrapped.onTestFail).toBeUndefined()
    expect(wrapped.onTestEnd).toBeUndefined()

    const ctx = await wrapped.setup()
    await wrapped.teardown(ctx)
  })
})
