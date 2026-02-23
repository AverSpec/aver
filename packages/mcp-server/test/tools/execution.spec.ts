import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RunStore } from '../../src/runs'
import {
  buildRunSummary,
  getFailureDetailsHandler,
  getTestTraceHandler,
  parseVitestJson,
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

  it('includes vocabulary coverage in run summary when available', () => {
    const run = {
      timestamp: '2026-01-01T00:00:00.000Z',
      results: [],
      vocabularyCoverage: [{
        domain: 'Cart',
        actions: { total: ['addItem'], called: ['addItem'] },
        queries: { total: ['total'], called: [] },
        assertions: { total: ['isEmpty'], called: [] },
        percentage: 33,
      }],
    }
    const summary = buildRunSummary(run)
    expect(summary.vocabularyCoverage).toEqual(run.vocabularyCoverage)
  })

  it('omits vocabulary coverage when not present', () => {
    const run = {
      timestamp: '2026-01-01T00:00:00.000Z',
      results: [],
    }
    const summary = buildRunSummary(run)
    expect(summary.vocabularyCoverage).toBeUndefined()
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

describe('parseVitestJson()', () => {
  it('parses valid vitest JSON into results', () => {
    const json = JSON.stringify({
      testResults: [{
        name: '/path/to/acceptance/Cart/cart.spec.ts',
        assertionResults: [
          { fullName: 'adds item to cart', status: 'passed' },
          { fullName: 'removes item from cart', status: 'failed' },
        ],
      }],
    })
    const run = parseVitestJson(json)
    expect(run.results).toHaveLength(2)
    expect(run.results[0]).toMatchObject({ testName: 'adds item to cart', status: 'pass' })
    expect(run.results[1]).toMatchObject({ testName: 'removes item from cart', status: 'fail' })
    expect(run.error).toBeUndefined()
  })

  it('returns error field when JSON is invalid', () => {
    const run = parseVitestJson('not valid json at all')
    expect(run.results).toEqual([])
    expect(run.error).toBeDefined()
    expect(run.error).toContain('Failed to parse vitest JSON output')
    expect(run.error).toContain('not valid json at all')
  })

  it('returns error field when input is empty string', () => {
    const run = parseVitestJson('')
    expect(run.results).toEqual([])
    expect(run.error).toBeDefined()
    expect(run.error).toContain('Failed to parse vitest JSON output')
  })

  it('returns empty results without error when testResults is missing', () => {
    const run = parseVitestJson('{}')
    expect(run.results).toEqual([])
    expect(run.error).toBeUndefined()
  })

  it('returns empty results without error when testResults is empty array', () => {
    const run = parseVitestJson(JSON.stringify({ testResults: [] }))
    expect(run.results).toEqual([])
    expect(run.error).toBeUndefined()
  })

  it('truncates raw output snippet to 500 chars', () => {
    const longGarbage = 'x'.repeat(1000)
    const run = parseVitestJson(longGarbage)
    expect(run.error).toBeDefined()
    // The snippet in the error message should be at most 500 chars of the original
    const snippetMatch = run.error!.match(/Raw output \(first 500 chars\): (.*)/)
    expect(snippetMatch).toBeTruthy()
    expect(snippetMatch![1].length).toBe(500)
  })
})

describe('buildRunSummary() error propagation', () => {
  it('propagates error from RunData to RunSummary', () => {
    const run = {
      timestamp: '2026-01-01T00:00:00.000Z',
      results: [],
      error: 'Failed to parse vitest JSON output: Unexpected token',
    }
    const summary = buildRunSummary(run)
    expect(summary.error).toBe('Failed to parse vitest JSON output: Unexpected token')
    expect(summary.total).toBe(0)
  })

  it('omits error when RunData has no error', () => {
    const run = {
      timestamp: '2026-01-01T00:00:00.000Z',
      results: [
        { testName: 'test1', domain: 'Cart', status: 'pass' as const, trace: [] },
      ],
    }
    const summary = buildRunSummary(run)
    expect(summary.error).toBeUndefined()
  })
})
