import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase, closeDatabase } from '../../src/db/index.js'
import { EventStore } from '../../src/db/event-store.js'
import type { Client } from '@libsql/client'

describe('EventStore', () => {
  let client: Client
  let store: EventStore

  beforeEach(async () => {
    client = await createDatabase(':memory:')
    store = new EventStore(client)
  })

  afterEach(() => {
    closeDatabase(client)
  })

  it('logEvent inserts event with id and createdAt', async () => {
    const event = await store.logEvent({
      type: 'cycle:start',
      data: { trigger: 'startup' },
    })

    expect(event.id).toBeTypeOf('string')
    expect(event.id.length).toBeGreaterThan(0)
    expect(event.type).toBe('cycle:start')
    expect(event.data).toEqual({ trigger: 'startup' })
    expect(event.createdAt).toBeTypeOf('string')
    expect(event.agentId).toBeUndefined()
  })

  it('logEvent stores agentId when provided', async () => {
    const event = await store.logEvent({
      agentId: 'abc',
      type: 'worker:dispatch',
      data: { goal: 'X' },
    })

    expect(event.agentId).toBe('abc')
    expect(event.type).toBe('worker:dispatch')
    expect(event.data).toEqual({ goal: 'X' })
  })

  it('getEvents returns all events ordered by createdAt', async () => {
    await store.logEvent({ type: 'cycle:start', data: { n: 1 } })
    await store.logEvent({ type: 'worker:dispatch', data: { n: 2 } })
    await store.logEvent({ type: 'cycle:end', data: { n: 3 } })

    const events = await store.getEvents()
    expect(events).toHaveLength(3)
    expect(events[0].type).toBe('cycle:start')
    expect(events[1].type).toBe('worker:dispatch')
    expect(events[2].type).toBe('cycle:end')

    for (let i = 1; i < events.length; i++) {
      expect(events[i].createdAt >= events[i - 1].createdAt).toBe(true)
    }
  })

  it('getEventsByType filters by type', async () => {
    await store.logEvent({ type: 'cycle:start', data: {} })
    await store.logEvent({ agentId: 'w1', type: 'worker:dispatch', data: { goal: 'A' } })
    await store.logEvent({ agentId: 'w2', type: 'worker:dispatch', data: { goal: 'B' } })
    await store.logEvent({ type: 'cycle:end', data: {} })

    const dispatches = await store.getEventsByType('worker:dispatch')
    expect(dispatches).toHaveLength(2)
    expect(dispatches[0].data.goal).toBe('A')
    expect(dispatches[1].data.goal).toBe('B')
  })

  it('getEventsSince returns events after the timestamp', async () => {
    const first = await store.logEvent({ type: 'early', data: {} })

    // Small delay to ensure timestamp separation
    await new Promise((r) => setTimeout(r, 5))

    await store.logEvent({ type: 'later', data: {} })
    await store.logEvent({ type: 'latest', data: {} })

    const events = await store.getEventsSince(first.createdAt)
    expect(events.length).toBeGreaterThanOrEqual(2)
    for (const e of events) {
      expect(e.createdAt > first.createdAt).toBe(true)
    }
  })

  it('getEventsSince with future timestamp returns empty array', async () => {
    await store.logEvent({ type: 'cycle:start', data: {} })

    const events = await store.getEventsSince('2099-12-31T23:59:59.999Z')
    expect(events).toEqual([])
  })
})
