import { describe, it, expect } from 'vitest'
import { eventually } from '../../src/core/eventually'

describe('eventually()', () => {
  it('resolves immediately when fn passes on first try', async () => {
    let calls = 0
    await eventually(() => { calls++ })
    expect(calls).toBe(1)
  })

  it('retries until fn passes', async () => {
    let calls = 0
    await eventually(() => {
      calls++
      if (calls < 3) throw new Error('not yet')
    }, { interval: 10 })
    expect(calls).toBe(3)
  })

  it('works with async fns', async () => {
    let calls = 0
    await eventually(async () => {
      calls++
      if (calls < 2) throw new Error('not yet')
    }, { interval: 10 })
    expect(calls).toBe(2)
  })

  it('times out with last failure message and cause', async () => {
    let calls = 0
    try {
      await eventually(() => {
        calls++
        throw new Error(`attempt ${calls}`)
      }, { timeout: 50, interval: 10 })
      expect.unreachable()
    } catch (err: any) {
      expect(err.message).toMatch(/Timed out after 50ms/)
      expect(err.message).toMatch(/Last failure: attempt/)
      expect(err.message).toMatch(/retries/)
      expect(err.cause).toBeInstanceOf(Error)
      expect(err.cause.message).toMatch(/^attempt \d+$/)
    }
  })

  it('respects custom timeout and interval', async () => {
    const start = Date.now()
    try {
      await eventually(() => { throw new Error('fail') }, { timeout: 100, interval: 30 })
    } catch {
      // expected
    }
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(90)
    expect(elapsed).toBeLessThan(300)
  })
})
