import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventLog } from '../../src/memory/events.js'
import type { AgentEvent } from '../../src/types.js'

describe('EventLog', () => {
  let dir: string
  let log: EventLog

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aver-events-'))
    log = new EventLog(dir)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('appends and reads events', async () => {
    const event: AgentEvent = {
      timestamp: new Date().toISOString(),
      type: 'cycle:start',
      cycleId: 'cycle-001',
      data: { goal: 'test' },
    }
    await log.append(event)
    const events = await log.readAll()
    expect(events).toHaveLength(1)
    expect(events[0].cycleId).toBe('cycle-001')
  })

  it('reads events since a given timestamp', async () => {
    const t1 = '2026-02-19T00:00:00Z'
    const t2 = '2026-02-19T01:00:00Z'
    const t3 = '2026-02-19T02:00:00Z'
    await log.append({ timestamp: t1, type: 'cycle:start', cycleId: 'c1', data: {} })
    await log.append({ timestamp: t2, type: 'cycle:end', cycleId: 'c1', data: {} })
    await log.append({ timestamp: t3, type: 'cycle:start', cycleId: 'c2', data: {} })
    const since = await log.readSince(t2)
    expect(since).toHaveLength(2)
    expect(since[0].cycleId).toBe('c1')
    expect(since[1].cycleId).toBe('c2')
  })

  it('truncates events before a given timestamp', async () => {
    const t1 = '2026-02-19T00:00:00Z'
    const t2 = '2026-02-19T01:00:00Z'
    await log.append({ timestamp: t1, type: 'cycle:start', cycleId: 'c1', data: {} })
    await log.append({ timestamp: t2, type: 'cycle:start', cycleId: 'c2', data: {} })
    await log.truncateBefore(t2)
    const events = await log.readAll()
    expect(events).toHaveLength(1)
    expect(events[0].cycleId).toBe('c2')
  })

  it('returns empty array when log file does not exist', async () => {
    const events = await log.readAll()
    expect(events).toEqual([])
  })

  it('rotates when file exceeds 5MB', async () => {
    // Write enough data to exceed 5MB
    const bigData = 'x'.repeat(1024) // 1KB payload
    for (let i = 0; i < 5200; i++) { // ~5.2MB
      await log.append({
        timestamp: new Date().toISOString(),
        type: 'cycle:start',
        cycleId: `cycle-${i}`,
        data: { payload: bigData },
      })
    }
    // After rotation, the current events.jsonl should be small or empty
    // and a rotated file should exist
    const files = await readdir(dir)
    const rotated = files.filter(f => f.startsWith('events-') && f.endsWith('.jsonl'))
    expect(rotated.length).toBeGreaterThanOrEqual(1)
  }, 30_000)

  it('reports file size via _testFileSize', async () => {
    await log.append({ timestamp: new Date().toISOString(), type: 'cycle:start', cycleId: 'c1', data: {} })
    const size = await EventLog._testFileSize(join(dir, 'events.jsonl'))
    expect(size).toBeGreaterThan(0)
  })
})
