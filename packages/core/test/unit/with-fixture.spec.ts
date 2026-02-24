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
