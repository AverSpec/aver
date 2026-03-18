// packages/aver/test/core/protocol.spec.ts
import { describe, it, expect } from 'vitest'
import type { Protocol } from '../../src/core/protocol'
import { withFixture } from '../../src/core/protocol'
import { unit } from '../../src/protocols/unit'

describe('Protocol interface', () => {
  it('can create a protocol with setup and teardown', async () => {
    const calls: string[] = []

    const testProtocol: Protocol<{ value: number }> = {
      name: 'test',
      async setup() {
        calls.push('setup')
        return { value: 42 }
      },
      async teardown(ctx) {
        calls.push(`teardown:${ctx.value}`)
      },
    }

    const ctx = await testProtocol.setup()
    expect(ctx).toEqual({ value: 42 })

    await testProtocol.teardown(ctx)
    expect(calls).toEqual(['setup', 'teardown:42'])
  })
})

describe('unit()', () => {
  it('creates a protocol named "unit"', () => {
    const proto = unit(() => ({ count: 0 }))
    expect(proto.name).toBe('unit')
  })

  it('calls factory on setup', async () => {
    const proto = unit(() => ({ count: 0 }))
    const ctx = await proto.setup()
    expect(ctx).toEqual({ count: 0 })
  })

  it('creates fresh context each setup', async () => {
    const proto = unit(() => ({ count: 0 }))
    const ctx1 = await proto.setup()
    const ctx2 = await proto.setup()
    expect(ctx1).not.toBe(ctx2)
  })

  it('accepts async factory', async () => {
    const proto = unit(async () => ({ data: 'loaded' }))
    const ctx = await proto.setup()
    expect(ctx).toEqual({ data: 'loaded' })
  })

  it('teardown is a no-op', async () => {
    const proto = unit(() => ({}))
    const ctx = await proto.setup()
    await expect(proto.teardown(ctx)).resolves.toBeUndefined()
  })

  it('defaults name to "unit" when no name provided', () => {
    const proto = unit(() => ({ count: 0 }))
    expect(proto.name).toBe('unit')
  })

  it('uses custom name when provided', () => {
    const proto = unit(() => ({ count: 0 }), 'in-memory')
    expect(proto.name).toBe('in-memory')
  })
})

describe('withFixture()', () => {
  it('preserves extensions from the original protocol', () => {
    const extensions = {
      approvals: { approve: async () => {} },
    }

    const proto: Protocol<void> = {
      name: 'test',
      async setup() {},
      async teardown() {},
      extensions,
    }

    const wrapped = withFixture(proto, {
      before: async () => {},
    })

    expect(wrapped.extensions).toBe(proto.extensions)
  })

  it('extensions reference the original object, not a spread copy', () => {
    const marker = { id: Symbol('original') }
    const extensions = { custom: marker }

    const proto: Protocol<void> = {
      name: 'test',
      async setup() {},
      async teardown() {},
      extensions: extensions as any,
    }

    const wrapped = withFixture(proto, {
      after: async () => {},
    })

    // Strict identity — not a copy
    expect(wrapped.extensions).toBe(extensions)
  })
})
