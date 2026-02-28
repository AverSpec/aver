import { describe, it, expect } from 'vitest'
import { withAbort } from '../../src/network/with-abort'

async function* countTo(n: number, delayMs = 0): AsyncGenerator<number> {
  for (let i = 1; i <= n; i++) {
    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs))
    yield i
  }
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = []
  for await (const item of gen) items.push(item)
  return items
}

describe('withAbort', () => {
  it('passes through all values when no timeout', async () => {
    const controller = new AbortController()
    const result = await collect(withAbort(countTo(3), controller.signal, 5000))
    expect(result).toEqual([1, 2, 3])
  })

  it('aborts on total signal', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(new Error('total timeout')), 50)
    await expect(collect(withAbort(countTo(5, 100), controller.signal, 5000)))
      .rejects.toThrow('total timeout')
  })

  it('aborts on turn timeout', async () => {
    const controller = new AbortController()
    await expect(collect(withAbort(countTo(3, 200), controller.signal, 50)))
      .rejects.toThrow(/timed out/)
  })

  it('throws immediately if signal already aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('already done'))
    await expect(collect(withAbort(countTo(3), controller.signal, 5000)))
      .rejects.toThrow('already done')
  })
})
