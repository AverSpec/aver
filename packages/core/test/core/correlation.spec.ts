import { describe, it, expect } from 'vitest'
import { verifyCorrelation } from '../../src/core/correlation'
import type { TraceEntry } from '../../src/core/trace'

function makeEntry(
  name: string,
  expectedAttrs: Record<string, string>,
  matchedSpan?: {
    name: string
    attributes: Record<string, unknown>
    traceId?: string
    spanId?: string
    links?: Array<{ traceId: string; spanId: string }>
  },
): TraceEntry {
  return {
    kind: 'action',
    name,
    payload: undefined,
    status: 'pass',
    telemetry: {
      expected: { span: `span.${name}`, attributes: expectedAttrs },
      matched: !!matchedSpan,
      matchedSpan,
    },
  }
}

describe('verifyCorrelation', () => {
  describe('attribute correlation', () => {
    it('correlated steps with matching attributes produce no violations', () => {
      const trace: TraceEntry[] = [
        makeEntry('checkout', { 'order.id': '123' }, {
          name: 'order.checkout', attributes: { 'order.id': '123' },
          traceId: 'aaa', spanId: '001',
        }),
        makeEntry('fulfillOrder', { 'order.id': '123' }, {
          name: 'order.fulfill', attributes: { 'order.id': '123' },
          traceId: 'aaa', spanId: '002',
        }),
      ]

      const result = verifyCorrelation(trace)
      expect(result.groups).toHaveLength(1)
      expect(result.groups[0].key).toBe('order.id')
      expect(result.violations).toHaveLength(0)
    })

    it('steps with different expected values are not correlated', () => {
      const trace: TraceEntry[] = [
        makeEntry('checkout', { 'order.id': '123' }, {
          name: 'order.checkout', attributes: { 'order.id': '123' },
          traceId: 'aaa', spanId: '001',
        }),
        makeEntry('checkout', { 'order.id': '456' }, {
          name: 'order.checkout', attributes: { 'order.id': '456' },
          traceId: 'bbb', spanId: '002',
        }),
      ]

      const result = verifyCorrelation(trace)
      expect(result.groups).toHaveLength(0) // no group has 2+ steps with same value
    })

    it('steps with different attribute keys are not correlated', () => {
      const trace: TraceEntry[] = [
        makeEntry('checkout', { 'order.id': '123' }, {
          name: 'order.checkout', attributes: { 'order.id': '123' },
          traceId: 'aaa', spanId: '001',
        }),
        makeEntry('sendConfirmation', { 'email.recipient': 'a@b.com' }, {
          name: 'notification.send', attributes: { 'email.recipient': 'a@b.com' },
          traceId: 'aaa', spanId: '002',
        }),
      ]

      const result = verifyCorrelation(trace)
      expect(result.groups).toHaveLength(0)
    })

    it('attribute missing on matched span reports violation', () => {
      const trace: TraceEntry[] = [
        makeEntry('checkout', { 'order.id': '123' }, {
          name: 'order.checkout', attributes: { 'order.id': '123' },
          traceId: 'aaa', spanId: '001',
        }),
        makeEntry('fulfillOrder', { 'order.id': '123' }, {
          name: 'order.fulfill', attributes: {}, // missing order.id
          traceId: 'aaa', spanId: '002',
        }),
      ]

      const result = verifyCorrelation(trace)
      expect(result.violations).toHaveLength(1)
      expect(result.violations[0]).toEqual(expect.objectContaining({
        kind: 'attribute-mismatch',
        key: 'order.id',
      }))
      expect(result.violations[0].message).toMatch(/order\.id/)
      expect(result.violations[0].message).toMatch(/fulfillOrder/)
    })

    it('attribute with wrong value on matched span reports violation', () => {
      const trace: TraceEntry[] = [
        makeEntry('checkout', { 'order.id': '123' }, {
          name: 'order.checkout', attributes: { 'order.id': '123' },
          traceId: 'aaa', spanId: '001',
        }),
        makeEntry('fulfillOrder', { 'order.id': '123' }, {
          name: 'order.fulfill', attributes: { 'order.id': '999' },
          traceId: 'aaa', spanId: '002',
        }),
      ]

      const result = verifyCorrelation(trace)
      expect(result.violations).toHaveLength(1)
      expect(result.violations[0].kind).toBe('attribute-mismatch')
      expect(result.violations[0].message).toMatch(/999/)
    })

    it('attribute type mismatch is reported — number vs string', () => {
      const trace: TraceEntry[] = [
        makeEntry('checkout', { 'order.id': '123' }, {
          name: 'order.checkout', attributes: { 'order.id': '123' },
          traceId: 'aaa', spanId: '001',
        }),
        makeEntry('fulfillOrder', { 'order.id': '123' }, {
          name: 'order.fulfill', attributes: { 'order.id': 123 }, // number, not string
          traceId: 'aaa', spanId: '002',
        }),
      ]

      const result = verifyCorrelation(trace)
      expect(result.violations).toHaveLength(1)
      expect(result.violations[0].kind).toBe('attribute-mismatch')
    })

    it('steps without telemetry are ignored', () => {
      const trace: TraceEntry[] = [
        makeEntry('checkout', { 'order.id': '123' }, {
          name: 'order.checkout', attributes: { 'order.id': '123' },
          traceId: 'aaa', spanId: '001',
        }),
        { kind: 'query', name: 'getStatus', payload: undefined, status: 'pass' },
        makeEntry('fulfillOrder', { 'order.id': '123' }, {
          name: 'order.fulfill', attributes: { 'order.id': '123' },
          traceId: 'aaa', spanId: '002',
        }),
      ]

      const result = verifyCorrelation(trace)
      expect(result.groups).toHaveLength(1)
      expect(result.violations).toHaveLength(0)
    })
  })

  describe('causal correlation', () => {
    it('correlated steps in same trace pass causal check', () => {
      const trace: TraceEntry[] = [
        makeEntry('checkout', { 'order.id': '123' }, {
          name: 'order.checkout', attributes: { 'order.id': '123' },
          traceId: 'aaa', spanId: '001',
        }),
        makeEntry('fulfillOrder', { 'order.id': '123' }, {
          name: 'order.fulfill', attributes: { 'order.id': '123' },
          traceId: 'aaa', spanId: '002',
        }),
      ]

      const result = verifyCorrelation(trace)
      expect(result.violations).toHaveLength(0)
    })

    it('correlated steps in different traces with link pass', () => {
      const trace: TraceEntry[] = [
        makeEntry('checkout', { 'order.id': '123' }, {
          name: 'order.checkout', attributes: { 'order.id': '123' },
          traceId: 'aaa', spanId: '001',
        }),
        makeEntry('fulfillOrder', { 'order.id': '123' }, {
          name: 'order.fulfill', attributes: { 'order.id': '123' },
          traceId: 'bbb', spanId: '002',
          links: [{ traceId: 'aaa', spanId: '001' }],
        }),
      ]

      const result = verifyCorrelation(trace)
      expect(result.violations).toHaveLength(0)
    })

    it('correlated steps in different traces without link report causal break', () => {
      const trace: TraceEntry[] = [
        makeEntry('checkout', { 'order.id': '123' }, {
          name: 'order.checkout', attributes: { 'order.id': '123' },
          traceId: 'aaa', spanId: '001',
        }),
        makeEntry('fulfillOrder', { 'order.id': '123' }, {
          name: 'order.fulfill', attributes: { 'order.id': '123' },
          traceId: 'bbb', spanId: '002',
        }),
      ]

      const result = verifyCorrelation(trace)
      expect(result.violations).toHaveLength(1)
      expect(result.violations[0]).toEqual(expect.objectContaining({
        kind: 'causal-break',
        key: 'order.id',
      }))
      expect(result.violations[0].message).toMatch(/different traces/)
    })

    it('uncorrelated steps skip causal check entirely', () => {
      const trace: TraceEntry[] = [
        makeEntry('createUser', { 'user.id': 'u1' }, {
          name: 'user.create', attributes: { 'user.id': 'u1' },
          traceId: 'aaa', spanId: '001',
        }),
        makeEntry('checkout', { 'order.id': '123' }, {
          name: 'order.checkout', attributes: { 'order.id': '123' },
          traceId: 'bbb', spanId: '002',
        }),
      ]

      const result = verifyCorrelation(trace)
      // No shared keys → no groups → no causal check
      expect(result.groups).toHaveLength(0)
      expect(result.violations).toHaveLength(0)
    })
  })
})
