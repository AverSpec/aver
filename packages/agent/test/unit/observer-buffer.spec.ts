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
    await vi.waitFor(() => expect(buffer.isBuffering('a1', 'test')).toBe(false))
  })

  it('does NOT trigger while already buffering (concurrency protection)', async () => {
    const { observer, calls, resolvers } = createMockObserver()
    const buffer = new ObservationBuffer(observer, CONFIG)

    // First call triggers buffering
    await buffer.onNewMessages('a1', 'test', msgs, 7000)
    expect(calls).toHaveLength(1)
    expect(buffer.isBuffering('a1', 'test')).toBe(true)

    // Second call while still buffering — skipped
    await buffer.onNewMessages('a1', 'test', msgs, 13000)
    expect(calls).toHaveLength(1)

    resolvers[0]()
    await vi.waitFor(() => expect(buffer.isBuffering('a1', 'test')).toBe(false))
  })

  it('buffer interval halves when pendingTokens > 50% of threshold', async () => {
    const { observer, calls, resolvers } = createMockObserver()
    const buffer = new ObservationBuffer(observer, CONFIG)

    // At 50%+ (>15000), interval becomes 3000
    // Boundary 0→5 at 16000 tokens (16000/3000 = 5.33, floor = 5)
    await buffer.onNewMessages('a1', 'test', msgs, 16_000)
    expect(calls).toHaveLength(1)
    resolvers[0]()
    await vi.waitFor(() => expect(buffer.isBuffering('a1', 'test')).toBe(false))

    // At 17000, boundary = floor(17000/3000) = 5, same as last → no trigger
    await buffer.onNewMessages('a1', 'test', msgs, 17_000)
    expect(calls).toHaveLength(1)

    // At 19000, boundary = floor(19000/3000) = 6, new → trigger
    await buffer.onNewMessages('a1', 'test', msgs, 19_000)
    expect(calls).toHaveLength(2)
    resolvers[1]()
    await vi.waitFor(() => expect(buffer.isBuffering('a1', 'test')).toBe(false))
  })

  it('buffer interval halves again when pendingTokens > 75% of threshold', async () => {
    const { observer, calls, resolvers } = createMockObserver()
    const buffer = new ObservationBuffer(observer, CONFIG)

    // At 75%+ (>22500), interval becomes 1500
    // Boundary at 23000 = floor(23000/1500) = 15
    await buffer.onNewMessages('a1', 'test', msgs, 23_000)
    expect(calls).toHaveLength(1)
    resolvers[0]()
    await vi.waitFor(() => expect(buffer.isBuffering('a1', 'test')).toBe(false))

    // At 24000, boundary = floor(24000/1500) = 16 → trigger
    await buffer.onNewMessages('a1', 'test', msgs, 24_000)
    expect(calls).toHaveLength(2)
    resolvers[1]()
    await vi.waitFor(() => expect(buffer.isBuffering('a1', 'test')).toBe(false))
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
    await vi.waitFor(() => expect(buffer.isBuffering('a1', 'test')).toBe(false))

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
    await vi.waitFor(() => expect(buffer.isBuffering('a1', 'test')).toBe(false))

    const first = await buffer.activate('a1', 'test')
    expect(first).toEqual(result)

    const second = await buffer.activate('a1', 'test')
    expect(second).toBeNull()
  })

  it('isBuffering() returns true during Observer call, false after', async () => {
    const { observer, resolvers } = createMockObserver()
    const buffer = new ObservationBuffer(observer, CONFIG)

    expect(buffer.isBuffering('a1', 'test')).toBe(false)

    await buffer.onNewMessages('a1', 'test', msgs, 7000)
    expect(buffer.isBuffering('a1', 'test')).toBe(true)

    resolvers[0]()
    await vi.waitFor(() => expect(buffer.isBuffering('a1', 'test')).toBe(false))
  })

  it('isolates buffers by scope — same agent, different scopes do not mix', async () => {
    const resultA: ObserverResult = {
      observations: [
        { scope: 'scenario:1', priority: 'critical', content: 'obs for scenario 1' },
      ],
    }
    const resultB: ObserverResult = {
      observations: [
        { scope: 'scenario:2', priority: 'important', content: 'obs for scenario 2' },
      ],
    }
    // Use two separate mock observers that return different results per call
    const calls: Array<{ agentId: string; scope: string }> = []
    const resolvers: Array<(r: ObserverResult) => void> = []
    const observer = {
      observe: vi.fn((_agentId: string, _scope: string, _messages: Message[]) => {
        calls.push({ agentId: _agentId, scope: _scope })
        return new Promise<ObserverResult>((resolve) => {
          resolvers.push(resolve)
        })
      }),
    } as unknown as Observer

    const buffer = new ObservationBuffer(observer, CONFIG)

    // Trigger buffering for scope A
    await buffer.onNewMessages('a1', 'scenario:1', msgs, 7000)
    expect(calls).toHaveLength(1)
    expect(calls[0].scope).toBe('scenario:1')
    expect(buffer.isBuffering('a1', 'scenario:1')).toBe(true)
    expect(buffer.isBuffering('a1', 'scenario:2')).toBe(false)

    // Trigger buffering for scope B concurrently — same agent, different scope
    await buffer.onNewMessages('a1', 'scenario:2', msgs, 7000)
    expect(calls).toHaveLength(2)
    expect(calls[1].scope).toBe('scenario:2')
    expect(buffer.isBuffering('a1', 'scenario:2')).toBe(true)

    // Resolve both with their respective results
    resolvers[0](resultA)
    resolvers[1](resultB)
    await vi.waitFor(() => {
      expect(buffer.isBuffering('a1', 'scenario:1')).toBe(false)
      expect(buffer.isBuffering('a1', 'scenario:2')).toBe(false)
    })

    // Activate scope A — should get resultA only
    const activatedA = await buffer.activate('a1', 'scenario:1')
    expect(activatedA).toEqual(resultA)

    // Activate scope B — should get resultB only
    const activatedB = await buffer.activate('a1', 'scenario:2')
    expect(activatedB).toEqual(resultB)

    // Both cleared
    expect(await buffer.activate('a1', 'scenario:1')).toBeNull()
    expect(await buffer.activate('a1', 'scenario:2')).toBeNull()
  })

  it('concurrency guard is per-scope — buffering one scope does not block another', async () => {
    const { observer, calls, resolvers } = createMockObserver()
    const buffer = new ObservationBuffer(observer, CONFIG)

    // Start buffering for scope A
    await buffer.onNewMessages('a1', 'scopeA', msgs, 7000)
    expect(calls).toHaveLength(1)
    expect(buffer.isBuffering('a1', 'scopeA')).toBe(true)

    // Scope B should NOT be blocked by scope A's buffering
    await buffer.onNewMessages('a1', 'scopeB', msgs, 7000)
    expect(calls).toHaveLength(2)
    expect(buffer.isBuffering('a1', 'scopeB')).toBe(true)

    resolvers[0]()
    resolvers[1]()
    await vi.waitFor(() => {
      expect(buffer.isBuffering('a1', 'scopeA')).toBe(false)
      expect(buffer.isBuffering('a1', 'scopeB')).toBe(false)
    })
  })
})
