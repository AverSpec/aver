// packages/aver/test/core/protocol.spec.ts
import { describe, it, expect } from 'vitest'
import type { Protocol } from '../../src/core/protocol'
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
})
