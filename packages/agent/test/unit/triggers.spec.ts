import { describe, it, expect, vi } from 'vitest'
import { TriggerQueue, type Trigger } from '../../src/network/triggers.js'

function makeTrigger(
  type: Trigger['type'],
  overrides?: Partial<Omit<Trigger, 'type'>>,
): Trigger {
  return {
    type,
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

describe('TriggerQueue', () => {
  it('fires callback immediately when idle', () => {
    const queue = new TriggerQueue()
    const cb = vi.fn()
    queue.onTrigger(cb)

    const trigger = makeTrigger('session:start')
    queue.push(trigger)

    expect(cb).toHaveBeenCalledOnce()
    expect(cb).toHaveBeenCalledWith([trigger])
  })

  it('queues trigger when active — callback NOT fired', () => {
    const queue = new TriggerQueue()
    const cb = vi.fn()
    queue.onTrigger(cb)
    queue.markActive()

    queue.push(makeTrigger('worker:critical'))

    expect(cb).not.toHaveBeenCalled()
    expect(queue.pendingCount).toBe(1)
  })

  it('fires callback with batch on markIdle when queue has triggers', () => {
    const queue = new TriggerQueue()
    const cb = vi.fn()
    queue.onTrigger(cb)
    queue.markActive()

    const t1 = makeTrigger('worker:critical', { agentId: 'w1' })
    const t2 = makeTrigger('worker:stuck', { agentId: 'w2' })
    queue.push(t1)
    queue.push(t2)

    expect(cb).not.toHaveBeenCalled()

    queue.markIdle()

    expect(cb).toHaveBeenCalledOnce()
    expect(cb).toHaveBeenCalledWith([t1, t2])
    expect(queue.pendingCount).toBe(0)
  })

  it('does NOT fire callback on markIdle when queue is empty', () => {
    const queue = new TriggerQueue()
    const cb = vi.fn()
    queue.onTrigger(cb)
    queue.markActive()

    queue.markIdle()

    expect(cb).not.toHaveBeenCalled()
  })

  it('debounces: two triggers of same type → only most recent kept', () => {
    const queue = new TriggerQueue()
    const cb = vi.fn()
    queue.onTrigger(cb)
    queue.markActive()

    const first = makeTrigger('worker:critical', { agentId: 'w1', data: { seq: 1 } })
    const second = makeTrigger('worker:critical', { agentId: 'w2', data: { seq: 2 } })
    queue.push(first)
    queue.push(second)

    expect(queue.pendingCount).toBe(1)

    queue.markIdle()

    expect(cb).toHaveBeenCalledOnce()
    expect(cb).toHaveBeenCalledWith([second])
  })

  it('no debounce across different types', () => {
    const queue = new TriggerQueue()
    const cb = vi.fn()
    queue.onTrigger(cb)
    queue.markActive()

    const critical = makeTrigger('worker:critical')
    const stuck = makeTrigger('worker:stuck')
    queue.push(critical)
    queue.push(stuck)

    expect(queue.pendingCount).toBe(2)

    queue.markIdle()

    expect(cb).toHaveBeenCalledWith([critical, stuck])
  })

  it('pendingCount reflects queue size', () => {
    const queue = new TriggerQueue()
    queue.markActive()

    expect(queue.pendingCount).toBe(0)

    queue.push(makeTrigger('worker:critical'))
    expect(queue.pendingCount).toBe(1)

    queue.push(makeTrigger('worker:stuck'))
    expect(queue.pendingCount).toBe(2)

    // Same type replaces — still 2
    queue.push(makeTrigger('worker:critical'))
    expect(queue.pendingCount).toBe(2)
  })

  it('isActive reflects state', () => {
    const queue = new TriggerQueue()

    expect(queue.isActive).toBe(false)

    queue.markActive()
    expect(queue.isActive).toBe(true)

    queue.markIdle()
    expect(queue.isActive).toBe(false)
  })

  it('push without registered callback does not throw', () => {
    const queue = new TriggerQueue()

    expect(() => queue.push(makeTrigger('session:start'))).not.toThrow()
    expect(queue.pendingCount).toBe(1) // queued since no callback to deliver to
  })

  it('push without callback while active queues the trigger', () => {
    const queue = new TriggerQueue()
    queue.markActive()

    queue.push(makeTrigger('human:message'))
    expect(queue.pendingCount).toBe(1)

    // Register callback late, then markIdle should deliver
    const cb = vi.fn()
    queue.onTrigger(cb)
    queue.markIdle()

    expect(cb).toHaveBeenCalledOnce()
    expect(queue.pendingCount).toBe(0)
  })
})
