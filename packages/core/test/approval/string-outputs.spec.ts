/**
 * Approval tests for Aver's own string outputs (P1-12).
 *
 * These lock down the most change-sensitive formatted strings so accidental
 * regressions are caught as diff failures rather than silent breakage.
 *
 * Run with AVER_APPROVE=1 to update baselines after intentional changes.
 */
import { describe, test } from 'vitest'
import { approve } from '@aver/approvals'
import { formatTrace, enhanceWithTrace } from '../../src/core/trace-format'
import { generateJUnitXml } from '../../src/reporter/junit'
import { buildMissingAdapterError } from '../../src/core/test-registration'
import { defineDomain } from '../../src/core/domain'
import { action, query, assertion } from '../../src/core/markers'
import { resetRegistry, registerAdapter } from '../../src/core/registry'
import type { TraceEntry } from '../../src/core/trace'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrace(overrides: Partial<TraceEntry> = {}): TraceEntry {
  return {
    kind: 'action',
    name: 'addItem',
    status: 'pass',
    durationMs: 12,
    payload: { id: 1, qty: 2 },
    ...overrides,
  }
}

const testDomain = defineDomain('Cart', {
  actions: { addItem: action<{ id: number }>() },
  queries: { itemCount: query<void, number>() },
  assertions: { isEmpty: assertion() },
})

// ---------------------------------------------------------------------------
// formatTrace
// ---------------------------------------------------------------------------

describe('formatTrace', () => {
  test('single passing action', async () => {
    const trace: TraceEntry[] = [makeTrace()]
    await approve(formatTrace(trace, 'Cart'), { name: 'single-pass-action' })
  })

  test('mixed pass and fail entries', async () => {
    const trace: TraceEntry[] = [
      makeTrace({ category: 'given', kind: 'action', name: 'addItem', status: 'pass', durationMs: 5, payload: { id: 1 } }),
      makeTrace({ category: 'when', kind: 'action', name: 'checkout', status: 'pass', durationMs: 120, payload: undefined }),
      makeTrace({ category: 'then', kind: 'assertion', name: 'isEmpty', status: 'fail', durationMs: 1, error: new Error('Cart is not empty'), payload: undefined }),
    ]
    await approve(formatTrace(trace, 'Cart'), { name: 'mixed-pass-fail' })
  })

  test('long payload is truncated', async () => {
    const trace: TraceEntry[] = [
      makeTrace({ payload: { longField: 'x'.repeat(100) } }),
    ]
    await approve(formatTrace(trace, 'Cart'), { name: 'truncated-payload' })
  })

  test('entry without category uses kind fallback', async () => {
    const trace: TraceEntry[] = [
      makeTrace({ category: undefined, kind: 'query', name: 'itemCount', status: 'pass', durationMs: 3, payload: undefined }),
    ]
    await approve(formatTrace(trace, 'Cart'), { name: 'kind-fallback' })
  })

  test('entry without duration omits ms', async () => {
    const trace: TraceEntry[] = [
      makeTrace({ durationMs: undefined }),
    ]
    await approve(formatTrace(trace, 'Cart'), { name: 'no-duration' })
  })
})

// ---------------------------------------------------------------------------
// enhanceWithTrace
// ---------------------------------------------------------------------------

describe('enhanceWithTrace', () => {
  test('wraps error with trace header', async () => {
    const trace: TraceEntry[] = [
      makeTrace({ category: 'given', name: 'addItem', status: 'pass', durationMs: 5 }),
      makeTrace({ category: 'then', kind: 'assertion', name: 'isEmpty', status: 'fail', durationMs: 1, error: new Error('not empty') }),
    ]
    const enhanced = enhanceWithTrace(new Error('Assertion failed'), trace, testDomain)
    await approve(enhanced.message, { name: 'enhanced-default' })
  })

  test('includes protocol name in header', async () => {
    const trace: TraceEntry[] = [makeTrace()]
    const enhanced = enhanceWithTrace(new Error('fail'), trace, testDomain, 'playwright')
    await approve(enhanced.message, { name: 'enhanced-with-protocol' })
  })

  test('returns original error when trace is empty', async () => {
    const enhanced = enhanceWithTrace(new Error('bare error'), [], testDomain)
    await approve(enhanced.message, { name: 'enhanced-empty-trace' })
  })
})

// ---------------------------------------------------------------------------
// generateJUnitXml
// ---------------------------------------------------------------------------

describe('generateJUnitXml', () => {
  test('report with passing and failing tests', async () => {
    const xml = generateJUnitXml({
      name: 'aver',
      testSuites: [
        {
          name: 'Cart',
          tests: 2,
          failures: 1,
          time: 0.15,
          testCases: [
            { name: 'adds item', classname: 'Cart > basics', time: 0.05 },
            {
              name: 'fails on empty',
              classname: 'Cart > edge',
              time: 0.1,
              failure: {
                message: 'Expected non-empty cart',
                body: 'Error: Expected non-empty cart\n  at test.spec.ts:42',
              },
            },
          ],
        },
      ],
    })
    await approve(xml, { name: 'junit-mixed' })
  })

  test('escapes XML special characters', async () => {
    const xml = generateJUnitXml({
      name: 'aver & friends',
      testSuites: [
        {
          name: 'Suite <"special">',
          tests: 1,
          failures: 1,
          time: 0.01,
          testCases: [
            {
              name: 'test with <html> & "quotes"',
              classname: "it's tricky",
              time: 0.01,
              failure: {
                message: 'a < b && c > d',
                body: 'stack with <tags> & "quotes"',
              },
            },
          ],
        },
      ],
    })
    await approve(xml, { name: 'junit-xml-escaping' })
  })

  test('empty report', async () => {
    const xml = generateJUnitXml({ name: 'empty', testSuites: [] })
    await approve(xml, { name: 'junit-empty' })
  })
})

// ---------------------------------------------------------------------------
// buildMissingAdapterError
// ---------------------------------------------------------------------------

describe('buildMissingAdapterError', () => {
  test('no adapters registered', async () => {
    resetRegistry()
    const msg = buildMissingAdapterError(testDomain)
    await approve(msg, { name: 'missing-adapter-none' })
  })

  test('other adapters registered', async () => {
    resetRegistry()
    const otherDomain = defineDomain('Auth', {
      actions: { login: action() },
      queries: {},
      assertions: {},
    })
    registerAdapter({
      domain: otherDomain,
      protocol: { name: 'unit' },
      context: () => ({}),
      handlers: { actions: { login: async () => {} }, queries: {}, assertions: {} },
    })
    const msg = buildMissingAdapterError(testDomain)
    await approve(msg, { name: 'missing-adapter-with-others' })
    resetRegistry()
  })
})
