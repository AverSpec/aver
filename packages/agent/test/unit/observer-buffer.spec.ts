import { describe, it, expect, vi } from 'vitest'
import {
  ObservationBuffer,
  type BufferConfig,
} from '../../src/observe/buffer.js'
import type { Observer, ObserverResult, Message } from '../../src/observe/observer.js'

function mockMessages(n: number): Message[] {
  return Array.from({ length: n }, (_, i) => ({
    role: 'assistant' as const,
    content: `msg-${i}`,
  }))
}

function createMockObserver(
  result: ObserverResult = { observations: [] },
): { observer: Observer; calls: Array<{ agentId: string; scope: string; messages: Message[] }>; resolvers: Array<() => void> } {
  const calls: Array<{ agentId: string; scope: string; messages: Message[] }> = []
  const resolvers: Array<() => void> = []

  const observer = {
    observe: vi.fn((agentId: string, scope: string, messages: Message[]) => {
      calls.push({ agentId, scope, messages })
      return new Promise<ObserverResult>((resolve) => {
        resolvers.push(() => resolve(result))
      })
    }),
  } as unknown as Observer

  return { observer, calls, resolvers }
}

const CONFIG: BufferConfig = {
  activationThreshold: 30_000,
  bufferIntervalRatio: 0.2,
}

// Base interval = 30000 * 0.2 = 6000

describe('ObservationBuffer', () => {
  const msgs = mockMessages(3)

  it('does NOT trigger Observer when pendingTokens is below first interval boundary', async () => {
    const { observer, calls } = createMockObserver()
    const buffer = new ObservationBuffer(observer, CONFIG)

    await buffer.onNewMessages('a1', 'test', msgs, 5000) // below 6000
    expect(calls).toHaveLength(0)
  })

  it('triggers Observer when pendingTokens crosses first interval boundary', async () => {
    const { observer, calls, resolvers } = createMockObserver()
    const buffer = new ObservationBuffer(observer, CONFIG)

    await buffer.onNewMessages('a1', 'test', msgs, 6500) // crosses 6000
    expect(calls).toHaveLength(1)
    expect(calls[0].agentId).toBe('a1')

    // Resolve to clean up
    resolvers[0]()
    await vi.waitFor(() => expect(buffer.isBuffering('a1')).toBe(false))
  })

  it('does NOT trigger while already buffering (concurrency protection)', async () => {
    const { observer, calls, resolvers } = createMockObserver()
    const buffer = new ObservationBuffer(observer, CONFIG)

    // First call triggers buffering
    await buffer.onNewMessages('a1', 'test', msgs, 7000)
    expect(calls).toHaveLength(1)
    expect(buffer.isBuffering('a1')).toBe(true)

    // Second call while still buffering — skipped
    await buffer.onNewMessages('a1', 'test', msgs, 13000)
    expect(calls).toHaveLength(1)

    resolvers[0]()
    await vi.waitFor(() => expect(buffer.isBuffering('a1')).toBe(false))
  })

  it('buffer interval halves when pendingTokens > 50% of threshold', async () => {
    const { observer, calls, resolvers } = createMockObserver()
    const buffer = new ObservationBuffer(observer, CONFIG)

    // At 50%+ (>15000), interval becomes 3000
    // Boundary 0→5 at 16000 tokens (16000/3000 = 5.33, floor = 5)
    await buffer.onNewMessages('a1', 'test', msgs, 16_000)
    expect(calls).toHaveLength(1)
    resolvers[0]()
    await vi.waitFor(() => expect(buffer.isBuffering('a1')).toBe(false))

    // At 17000, boundary = floor(17000/3000) = 5, same as last → no trigger
    await buffer.onNewMessages('a1', 'test', msgs, 17_000)
    expect(calls).toHaveLength(1)

    // At 19000, boundary = floor(19000/3000) = 6, new → trigger
    await buffer.onNewMessages('a1', 'test', msgs, 19_000)
    expect(calls).toHaveLength(2)
    resolvers[1]()
    await vi.waitFor(() => expect(buffer.isBuffering('a1')).toBe(false))
  })

  it('buffer interval halves again when pendingTokens > 75% of threshold', async () => {
    const { observer, calls, resolvers } = createMockObserver()
    const buffer = new ObservationBuffer(observer, CONFIG)

    // At 75%+ (>22500), interval becomes 1500
    // Boundary at 23000 = floor(23000/1500) = 15
    await buffer.onNewMessages('a1', 'test', msgs, 23_000)
    expect(calls).toHaveLength(1)
    resolvers[0]()
    await vi.waitFor(() => expect(buffer.isBuffering('a1')).toBe(false))

    // At 24000, boundary = floor(24000/1500) = 16 → trigger
    await buffer.onNewMessages('a1', 'test', msgs, 24_000)
    expect(calls).toHaveLength(2)
    resolvers[1]()
    await vi.waitFor(() => expect(buffer.isBuffering('a1')).toBe(false))
  })

  it('activate() returns buffered observations', async () => {
    const result: ObserverResult = {
      observations: [
        { scope: 'test', priority: 'critical', content: 'something important' },
      ],
      currentTask: 'doing stuff',
    }
    const { observer, resolvers } = createMockObserver(result)
    const buffer = new ObservationBuffer(observer, CONFIG)

    await buffer.onNewMessages('a1', 'test', msgs, 7000)
    resolvers[0]()
    await vi.waitFor(() => expect(buffer.isBuffering('a1')).toBe(false))

    const activated = await buffer.activate('a1', 'test')
    expect(activated).toEqual(result)
  })

  it('activate() returns null when no buffer ready', async () => {
    const { observer } = createMockObserver()
    const buffer = new ObservationBuffer(observer, CONFIG)

    const activated = await buffer.activate('a1', 'test')
    expect(activated).toBeNull()
  })

  it('activate() clears the buffer after returning', async () => {
    const result: ObserverResult = {
      observations: [
        { scope: 'test', priority: 'important', content: 'data' },
      ],
    }
    const { observer, resolvers } = createMockObserver(result)
    const buffer = new ObservationBuffer(observer, CONFIG)

    await buffer.onNewMessages('a1', 'test', msgs, 7000)
    resolvers[0]()
    await vi.waitFor(() => expect(buffer.isBuffering('a1')).toBe(false))

    const first = await buffer.activate('a1', 'test')
    expect(first).toEqual(result)

    const second = await buffer.activate('a1', 'test')
    expect(second).toBeNull()
  })

  it('isBuffering() returns true during Observer call, false after', async () => {
    const { observer, resolvers } = createMockObserver()
    const buffer = new ObservationBuffer(observer, CONFIG)

    expect(buffer.isBuffering('a1')).toBe(false)

    await buffer.onNewMessages('a1', 'test', msgs, 7000)
    expect(buffer.isBuffering('a1')).toBe(true)

    resolvers[0]()
    await vi.waitFor(() => expect(buffer.isBuffering('a1')).toBe(false))
  })
})
