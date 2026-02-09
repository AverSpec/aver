import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RunStore } from '../../src/runs'
import {
  buildRunSummary,
  getFailureDetailsHandler,
  getTestTraceHandler,
} from '../../src/tools/execution'

describe('buildRunSummary()', () => {
  it('builds a summary from run data', () => {
    const run = {
      timestamp: '2026-02-08T14:30:00.000Z',
      results: [
        { testName: 'test1', domain: 'Cart', status: 'pass' as const, trace: [] },
        { testName: 'test2', domain: 'Cart', status: 'fail' as const, trace: [
          { kind: 'assertion', name: 'isEmpty', status: 'fail', error: 'Expected empty' },
        ]},
        { testName: 'test3', domain: 'Auth', status: 'pass' as const, trace: [] },
      ],
    }
    const summary = buildRunSummary(run)
    expect(summary.total).toBe(3)
    expect(summary.passed).toBe(2)
    expect(summary.failed).toBe(1)
    expect(summary.failures).toEqual([
      { testName: 'test2', domain: 'Cart' },
    ])
  })
})

describe('getFailureDetailsHandler()', () => {
  let dir: string
  let store: RunStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aver-exec-'))
    store = new RunStore(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns failure details from the latest run', () => {
    store.save({
      timestamp: '2026-02-08T14:30:00.000Z',
      results: [
        { testName: 'test1', domain: 'Cart', status: 'pass', trace: [] },
        { testName: 'test2', domain: 'Cart', status: 'fail', trace: [
          { kind: 'action', name: 'addItem', status: 'pass' },
          { kind: 'assertion', name: 'isEmpty', status: 'fail', error: 'not empty' },
        ]},
      ],
    })
    const result = getFailureDetailsHandler(store)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].testName).toBe('test2')
    expect(result.failures[0].trace).toHaveLength(2)
  })

  it('filters by domain when provided', () => {
    store.save({
      timestamp: '2026-02-08T14:30:00.000Z',
      results: [
        { testName: 't1', domain: 'Cart', status: 'fail', trace: [] },
        { testName: 't2', domain: 'Auth', status: 'fail', trace: [] },
      ],
    })
    const result = getFailureDetailsHandler(store, { domain: 'Cart' })
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].domain).toBe('Cart')
  })

  it('returns empty failures when no runs exist', () => {
    const result = getFailureDetailsHandler(store)
    expect(result.failures).toEqual([])
  })
})

describe('getTestTraceHandler()', () => {
  let dir: string
  let store: RunStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aver-trace-'))
    store = new RunStore(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns the trace for a named test', () => {
    store.save({
      timestamp: '2026-02-08T14:30:00.000Z',
      results: [
        { testName: 'my test', domain: 'Cart', status: 'pass', trace: [
          { kind: 'action', name: 'addItem', status: 'pass' },
          { kind: 'query', name: 'total', status: 'pass' },
        ]},
      ],
    })
    const result = getTestTraceHandler(store, 'my test')
    expect(result?.trace).toHaveLength(2)
  })

  it('returns null for unknown test', () => {
    store.save({
      timestamp: '2026-02-08T14:30:00.000Z',
      results: [],
    })
    const result = getTestTraceHandler(store, 'nonexistent')
    expect(result).toBeNull()
  })
})
