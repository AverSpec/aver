import { describe, it, expect } from 'vitest'
import { formatTrace } from '../../src/core/trace-format'
import type { TraceEntry } from '../../src/core/trace'

describe('formatTrace', () => {
  it('uses category labels when present', () => {
    const trace: TraceEntry[] = [
      { kind: 'action', category: 'given', name: 'addItem', payload: { name: 'Widget' }, status: 'pass', startAt: 0, endAt: 12, durationMs: 12 },
      { kind: 'action', category: 'when', name: 'checkout', payload: undefined, status: 'pass', startAt: 12, endAt: 57, durationMs: 45 },
      { kind: 'assertion', category: 'then', name: 'totalCharged', payload: { amount: 35 }, status: 'pass', startAt: 57, endAt: 59, durationMs: 2 },
    ]
    const output = formatTrace(trace, 'Cart')
    expect(output).toContain('GIVEN')
    expect(output).toContain('WHEN')
    expect(output).toContain('THEN')
    expect(output).toContain('addItem')
    expect(output).toContain('checkout')
    expect(output).toContain('totalCharged')
  })

  it('falls back to kind-based labels when category is absent', () => {
    const trace: TraceEntry[] = [
      { kind: 'action', name: 'doThing', payload: undefined, status: 'pass' },
      { kind: 'query', name: 'getVal', payload: undefined, status: 'pass' },
      { kind: 'assertion', name: 'check', payload: undefined, status: 'pass' },
    ]
    const output = formatTrace(trace, 'Test')
    expect(output).toContain('ACT')
    expect(output).toContain('QUERY')
    expect(output).toContain('ASSERT')
  })

  it('shows FAIL status on failed entries', () => {
    const trace: TraceEntry[] = [
      { kind: 'action', category: 'given', name: 'setup', payload: undefined, status: 'pass' },
      { kind: 'assertion', category: 'then', name: 'check', payload: undefined, status: 'fail', error: new Error('boom') },
    ]
    const output = formatTrace(trace, 'Test')
    expect(output).toContain('[PASS]')
    expect(output).toContain('[FAIL]')
    expect(output).toContain('boom')
  })

  it('shows duration when available', () => {
    const trace: TraceEntry[] = [
      { kind: 'action', category: 'act', name: 'doThing', payload: undefined, status: 'pass', durationMs: 42 },
    ]
    const output = formatTrace(trace, 'Test')
    expect(output).toContain('42ms')
  })

  it('truncates long payloads on passing steps', () => {
    const trace: TraceEntry[] = [
      { kind: 'action', category: 'act', name: 'doThing', payload: { data: 'a'.repeat(100) }, status: 'pass' },
    ]
    const output = formatTrace(trace, 'Test')
    expect(output).toContain('...')
    expect(output).not.toContain('a'.repeat(100))
  })

  it('shows full payload on failing steps', () => {
    const longValue = 'a'.repeat(100)
    const trace: TraceEntry[] = [
      { kind: 'assertion', category: 'then', name: 'check', payload: { data: longValue }, status: 'fail', error: new Error('mismatch') },
    ]
    const output = formatTrace(trace, 'Test')
    expect(output).toContain(longValue)
    expect(output).not.toMatch(/\.\.\."?\)/)
  })

  it('handles test kind entries without category', () => {
    const trace: TraceEntry[] = [
      { kind: 'test', name: 'hook-error:onTestFail', payload: undefined, status: 'fail', error: new Error('hook broke') },
    ]
    const output = formatTrace(trace, 'Test')
    expect(output).toContain('[FAIL]')
    expect(output).toContain('hook-error:onTestFail')
  })
})
