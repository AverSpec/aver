import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RunStore } from '../src/runs'

describe('RunStore', () => {
  let dir: string
  let store: RunStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aver-runs-'))
    store = new RunStore(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('saves and retrieves a run', () => {
    const run = {
      timestamp: '2026-02-08T14:30:00.000Z',
      results: [
        { testName: 'test1', domain: 'Cart', status: 'pass' as const, trace: [] },
      ],
    }
    store.save(run)
    const latest = store.getLatest()
    expect(latest).toEqual(run)
  })

  it('returns undefined when no runs exist', () => {
    expect(store.getLatest()).toBeUndefined()
  })

  it('returns the two most recent runs for diffing', () => {
    const run1 = { timestamp: '2026-02-08T14:00:00.000Z', results: [] }
    const run2 = { timestamp: '2026-02-08T14:30:00.000Z', results: [] }
    store.save(run1)
    store.save(run2)
    const [prev, curr] = store.getLastTwo()
    expect(prev?.timestamp).toBe('2026-02-08T14:00:00.000Z')
    expect(curr?.timestamp).toBe('2026-02-08T14:30:00.000Z')
  })

  it('enforces retention limit of 10 runs', () => {
    for (let i = 0; i < 12; i++) {
      store.save({ timestamp: `2026-02-08T${String(i).padStart(2, '0')}:00:00.000Z`, results: [] })
    }
    const files = store.listRuns()
    expect(files.length).toBeLessThanOrEqual(10)
  })
})
