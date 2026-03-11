import { describe, it, expect } from 'vitest'
import { defineDomain, action, query, assertion } from '@aver/core'
import type { TraceEntry } from '@aver/core'
import { extractContract } from '../src/extract'

// -- Test domain with mixed telemetry declarations --

const testDomain = defineDomain({
  name: 'signup-flow',
  actions: {
    signUp: action<{ email: string }>({
      telemetry: (p) => ({
        span: 'user.signup',
        attributes: { 'user.email': p.email },
      }),
    }),
    setPassword: action<{ password: string }>(),
  },
  queries: {},
  assertions: {
    accountCreated: assertion<{ email: string }>({
      telemetry: (p) => ({
        span: 'account.created',
        attributes: { 'account.email': p.email },
      }),
    }),
  },
})

const staticDomain = defineDomain({
  name: 'order-management',
  actions: {
    cancelOrder: action({
      telemetry: {
        span: 'order.cancel',
        attributes: { 'order.status': 'cancelled' },
      },
    }),
  },
  queries: {},
  assertions: {},
})

// -- Helpers --

function traceEntry(overrides: Partial<TraceEntry> & Pick<TraceEntry, 'kind' | 'name'>): TraceEntry {
  return {
    payload: undefined,
    status: 'pass',
    ...overrides,
  }
}

// -- Tests --

describe('extractContract', () => {
  describe('behavioral-trace: exportTrace', () => {
    it('parameterized telemetry produces correlated contract', () => {
      const result = extractContract({
        domain: testDomain,
        results: [{
          testName: 'signup creates account',
          trace: [
            traceEntry({
              kind: 'action',
              name: 'signUp',
              payload: { email: 'test@example.com' },
              telemetry: {
                expected: { span: 'user.signup', attributes: { 'user.email': 'test@example.com' } },
                matched: true,
              },
            }),
            traceEntry({
              kind: 'assertion',
              name: 'accountCreated',
              payload: { email: 'test@example.com' },
              telemetry: {
                expected: { span: 'account.created', attributes: { 'account.email': 'test@example.com' } },
                matched: true,
              },
            }),
          ],
        }],
      })

      expect(result.domain).toBe('signup-flow')
      expect(result.entries).toHaveLength(1)

      const entry = result.entries[0]
      expect(entry.testName).toBe('signup creates account')
      expect(entry.spans).toHaveLength(2)

      // Both email attributes should be correlated, not literal
      expect(entry.spans[0]).toEqual({
        name: 'user.signup',
        attributes: { 'user.email': { kind: 'correlated', symbol: '$email' } },
      })
      expect(entry.spans[1]).toEqual({
        name: 'account.created',
        attributes: { 'account.email': { kind: 'correlated', symbol: '$email' } },
      })
    })

    it('static telemetry produces literal bindings', () => {
      const result = extractContract({
        domain: staticDomain,
        results: [{
          testName: 'cancel order sets status',
          trace: [
            traceEntry({
              kind: 'action',
              name: 'cancelOrder',
              telemetry: {
                expected: { span: 'order.cancel', attributes: { 'order.status': 'cancelled' } },
                matched: true,
              },
            }),
          ],
        }],
      })

      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].spans[0]).toEqual({
        name: 'order.cancel',
        attributes: { 'order.status': { kind: 'literal', value: 'cancelled' } },
      })
    })

    it('operations without telemetry are excluded from contract', () => {
      const result = extractContract({
        domain: testDomain,
        results: [{
          testName: 'signup with password',
          trace: [
            traceEntry({
              kind: 'action',
              name: 'signUp',
              payload: { email: 'test@example.com' },
              telemetry: {
                expected: { span: 'user.signup', attributes: { 'user.email': 'test@example.com' } },
                matched: true,
              },
            }),
            traceEntry({
              kind: 'action',
              name: 'setPassword',
              payload: { password: 'secret' },
              // No telemetry — no declaration on this marker
            }),
            traceEntry({
              kind: 'assertion',
              name: 'accountCreated',
              payload: { email: 'test@example.com' },
              telemetry: {
                expected: { span: 'account.created', attributes: { 'account.email': 'test@example.com' } },
                matched: true,
              },
            }),
          ],
        }],
      })

      expect(result.entries[0].spans).toHaveLength(2)
      expect(result.entries[0].spans[0].name).toBe('user.signup')
      expect(result.entries[0].spans[1].name).toBe('account.created')
    })

    it('failing tests produce no contract entry', () => {
      const result = extractContract({
        domain: testDomain,
        results: [],  // No passing results
      })

      expect(result.entries).toHaveLength(0)
    })

    it('extraction captures parentName from matched span hierarchy', () => {
      const result = extractContract({
        domain: testDomain,
        results: [{
          testName: 'signup with parent hierarchy',
          trace: [
            traceEntry({
              kind: 'action',
              name: 'signUp',
              payload: { email: 'test@example.com' },
              telemetry: {
                expected: { span: 'user.signup', attributes: { 'user.email': 'test@example.com' } },
                matched: true,
                matchedSpan: {
                  name: 'user.signup',
                  attributes: { 'user.email': 'test@example.com' },
                  spanId: 'span-1',
                },
              },
            }),
            traceEntry({
              kind: 'assertion',
              name: 'accountCreated',
              payload: { email: 'test@example.com' },
              telemetry: {
                expected: { span: 'account.created', attributes: { 'account.email': 'test@example.com' } },
                matched: true,
                matchedSpan: {
                  name: 'account.created',
                  attributes: { 'account.email': 'test@example.com' },
                  spanId: 'span-2',
                  parentSpanId: 'span-1',
                },
              },
            }),
          ],
        }],
      })

      expect(result.entries[0].spans[0].parentName).toBeUndefined()
      expect(result.entries[0].spans[1].parentName).toBe('user.signup')
    })

    it('extraction omits parentName when matchedSpan has no parentSpanId', () => {
      const result = extractContract({
        domain: testDomain,
        results: [{
          testName: 'no hierarchy info',
          trace: [
            traceEntry({
              kind: 'action',
              name: 'signUp',
              payload: { email: 'test@example.com' },
              telemetry: {
                expected: { span: 'user.signup', attributes: { 'user.email': 'test@example.com' } },
                matched: true,
                matchedSpan: {
                  name: 'user.signup',
                  attributes: { 'user.email': 'test@example.com' },
                  spanId: 'span-1',
                },
              },
            }),
          ],
        }],
      })

      expect(result.entries[0].spans[0].parentName).toBeUndefined()
    })

    it('parameterized tests produce multiple contract entries', () => {
      const results = [
        {
          testName: 'signup with gmail',
          trace: [
            traceEntry({
              kind: 'action' as const,
              name: 'signUp',
              payload: { email: 'user@gmail.com' },
              telemetry: {
                expected: { span: 'user.signup', attributes: { 'user.email': 'user@gmail.com' } },
                matched: true,
              },
            }),
          ],
        },
        {
          testName: 'signup with outlook',
          trace: [
            traceEntry({
              kind: 'action' as const,
              name: 'signUp',
              payload: { email: 'user@outlook.com' },
              telemetry: {
                expected: { span: 'user.signup', attributes: { 'user.email': 'user@outlook.com' } },
                matched: true,
              },
            }),
          ],
        },
        {
          testName: 'signup with company',
          trace: [
            traceEntry({
              kind: 'action' as const,
              name: 'signUp',
              payload: { email: 'user@company.com' },
              telemetry: {
                expected: { span: 'user.signup', attributes: { 'user.email': 'user@company.com' } },
                matched: true,
              },
            }),
          ],
        },
      ]

      const contract = extractContract({ domain: testDomain, results })

      expect(contract.entries).toHaveLength(3)
      // All should have correlated email, not literal
      for (const entry of contract.entries) {
        expect(entry.spans[0].attributes['user.email']).toEqual({
          kind: 'correlated',
          symbol: '$email',
        })
      }
    })
  })
})
