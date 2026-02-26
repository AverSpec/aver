import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase, closeDatabase } from '../../src/db/index.js'
import { SessionStore } from '../../src/db/session-store.js'
import type { Client } from '@libsql/client'

describe('SessionStore', () => {
  let client: Client
  let store: SessionStore

  beforeEach(async () => {
    client = await createDatabase(':memory:')
    store = new SessionStore(client)
  })

  afterEach(() => {
    closeDatabase(client)
  })

  it('createSession creates session with status=running and zero token usage', async () => {
    const session = await store.createSession({ goal: 'analyze X' })

    expect(session.id).toBeTypeOf('string')
    expect(session.id.length).toBeGreaterThan(0)
    expect(session.goal).toBe('analyze X')
    expect(session.status).toBe('running')
    expect(session.tokenUsage).toEqual({
      supervisor: 0,
      worker: 0,
      observer: 0,
      reflector: 0,
    })
    expect(session.createdAt).toBeTypeOf('string')
    expect(session.updatedAt).toBeTypeOf('string')
  })

  it('getSession returns session by id', async () => {
    const created = await store.createSession({ goal: 'test goal' })

    const fetched = await store.getSession(created.id)
    expect(fetched).toBeDefined()
    expect(fetched!.id).toBe(created.id)
    expect(fetched!.goal).toBe('test goal')
    expect(fetched!.status).toBe('running')
    expect(fetched!.tokenUsage).toEqual({
      supervisor: 0,
      worker: 0,
      observer: 0,
      reflector: 0,
    })
  })

  it('getSession returns undefined for missing id', async () => {
    const result = await store.getSession('nonexistent-id')
    expect(result).toBeUndefined()
  })

  it('updateSession updates status and updatedAt', async () => {
    const session = await store.createSession({ goal: 'some goal' })
    const originalUpdatedAt = session.updatedAt

    // Small delay to ensure updatedAt differs
    await new Promise((r) => setTimeout(r, 5))

    await store.updateSession(session.id, { status: 'complete' })

    const updated = await store.getSession(session.id)
    expect(updated!.status).toBe('complete')
    expect(updated!.updatedAt).not.toBe(originalUpdatedAt)
  })

  it('updateSession updates token usage', async () => {
    const session = await store.createSession({ goal: 'token test' })

    const tokenUsage = { supervisor: 100, worker: 200, observer: 50, reflector: 30 }
    await store.updateSession(session.id, { tokenUsage })

    const updated = await store.getSession(session.id)
    expect(updated!.tokenUsage).toEqual(tokenUsage)
  })

  it('getCurrentSession returns most recent running session', async () => {
    await store.createSession({ goal: 'first' })
    // Small delay to ensure created_at timestamps differ for ordering
    await new Promise((r) => setTimeout(r, 5))
    const second = await store.createSession({ goal: 'second' })

    const current = await store.getCurrentSession()
    expect(current).toBeDefined()
    expect(current!.id).toBe(second.id)
    expect(current!.goal).toBe('second')
  })

  it('getCurrentSession returns undefined when no running sessions', async () => {
    const session = await store.createSession({ goal: 'will complete' })
    await store.updateSession(session.id, { status: 'complete' })

    const current = await store.getCurrentSession()
    expect(current).toBeUndefined()
  })
})
