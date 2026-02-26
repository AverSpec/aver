import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabase, closeDatabase } from '../../src/db/index.js'
import type { Client } from '@libsql/client'

describe('Database', () => {
  const clients: Client[] = []

  const tracked = async (path: string) => {
    const client = await createDatabase(path)
    clients.push(client)
    return client
  }

  afterEach(async () => {
    for (const c of clients) {
      closeDatabase(c)
    }
    clients.length = 0
  })

  it('createDatabase(:memory:) returns a client instance', async () => {
    const client = await tracked(':memory:')
    expect(client).toBeDefined()
    expect(client.execute).toBeTypeOf('function')
  })

  it('schema tables exist after creation', async () => {
    const client = await tracked(':memory:')
    const result = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    )
    const tables = result.rows.map((r) => r.name as string)
    expect(tables).toContain('agents')
    expect(tables).toContain('scenarios')
    expect(tables).toContain('observations')
    expect(tables).toContain('events')
    expect(tables).toContain('sessions')
  })

  it('WAL mode is enabled for file-backed databases', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aver-db-'))
    const dbPath = join(dir, 'test.db')
    const client = await createDatabase(dbPath)
    clients.push(client)
    try {
      const result = await client.execute('PRAGMA journal_mode')
      expect(result.rows[0]?.journal_mode).toBe('wal')
    } finally {
      closeDatabase(client)
      clients.pop()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('closeDatabase() closes cleanly', async () => {
    const client = await createDatabase(':memory:')
    // Should not throw
    closeDatabase(client)
    // After closing, executing should throw
    await expect(client.execute('SELECT 1')).rejects.toThrow()
  })

  it('two connections to same in-memory db work', async () => {
    const client1 = await tracked(':memory:')
    const client2 = await tracked(':memory:')
    // Both should have the schema tables
    const r1 = await client1.execute(
      "SELECT count(*) as cnt FROM sqlite_master WHERE type='table'"
    )
    const r2 = await client2.execute(
      "SELECT count(*) as cnt FROM sqlite_master WHERE type='table'"
    )
    expect(Number(r1.rows[0]?.cnt)).toBeGreaterThanOrEqual(5)
    expect(Number(r2.rows[0]?.cnt)).toBeGreaterThanOrEqual(5)
  })
})
