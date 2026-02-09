import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RunStore } from '../../src/runs'
import { getRunDiffHandler } from '../../src/tools/reporting'

describe('get_run_diff handler', () => {
  let dir: string
  let store: RunStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aver-diff-'))
    store = new RunStore(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns null when fewer than 2 runs exist', () => {
    expect(getRunDiffHandler(store)).toBeNull()
    store.save({ timestamp: '2026-02-08T14:00:00.000Z', results: [] })
    expect(getRunDiffHandler(store)).toBeNull()
  })

  it('diffs two runs correctly', () => {
    store.save({
      timestamp: '2026-02-08T14:00:00.000Z',
      results: [
        { testName: 'test-a', domain: 'Cart', status: 'pass', trace: [] },
        { testName: 'test-b', domain: 'Cart', status: 'fail', trace: [] },
        { testName: 'test-c', domain: 'Cart', status: 'fail', trace: [] },
      ],
    })
    store.save({
      timestamp: '2026-02-08T14:30:00.000Z',
      results: [
        { testName: 'test-a', domain: 'Cart', status: 'fail', trace: [] },
        { testName: 'test-b', domain: 'Cart', status: 'pass', trace: [] },
        { testName: 'test-c', domain: 'Cart', status: 'fail', trace: [] },
        { testName: 'test-d', domain: 'Cart', status: 'pass', trace: [] },
      ],
    })

    const diff = getRunDiffHandler(store)!
    expect(diff.previousRun).toBe('2026-02-08T14:00:00.000Z')
    expect(diff.currentRun).toBe('2026-02-08T14:30:00.000Z')
    expect(diff.newlyFailing).toEqual(['test-a'])
    expect(diff.newlyPassing).toEqual(['test-b'])
    expect(diff.stillFailing).toEqual(['test-c'])
    expect(diff.stillPassing).toBe(1)
  })
})
