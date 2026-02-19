import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionStore } from '../../src/memory/session.js'

describe('SessionStore', () => {
  let dir: string
  let store: SessionStore

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aver-session-'))
    store = new SessionStore(dir)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('creates a new session', async () => {
    const session = await store.create('add task cancellation')
    expect(session.goal).toBe('add task cancellation')
    expect(session.status).toBe('running')
    expect(session.cycleCount).toBe(0)
  })

  it('loads an existing session', async () => {
    await store.create('test goal')
    const loaded = await store.load()
    expect(loaded).not.toBeUndefined()
    expect(loaded!.goal).toBe('test goal')
  })

  it('updates session fields', async () => {
    await store.create('test')
    await store.update({ cycleCount: 5, tokenUsage: { supervisor: 1000, worker: 5000 } })
    const loaded = await store.load()
    expect(loaded!.cycleCount).toBe(5)
    expect(loaded!.tokenUsage.supervisor).toBe(1000)
  })

  it('returns undefined when no session exists', async () => {
    const loaded = await store.load()
    expect(loaded).toBeUndefined()
  })
})
