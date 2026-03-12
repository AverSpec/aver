import { describe, it, expect } from 'vitest'
import { verifyContract } from '../src/verify'
import type { BehavioralContract, ProductionTrace } from '../src/index'

// -- Test contract --

const signupContract: BehavioralContract = {
  domain: 'signup-flow',
  entries: [{
    testName: 'signup creates account',
    spans: [
      {
        name: 'user.signup',
        attributes: {
          'user.email': { kind: 'correlated', symbol: '$email' },
        },
      },
      {
        name: 'account.created',
        attributes: {
          'account.email': { kind: 'correlated', symbol: '$email' },
        },
      },
    ],
  }],
}

const orderContract: BehavioralContract = {
  domain: 'order-management',
  entries: [{
    testName: 'cancel sets status',
    spans: [
      {
        name: 'order.cancel',
        attributes: {
          'order.status': { kind: 'literal', value: 'cancelled' },
        },
      },
    ],
  }],
}

const cartContract: BehavioralContract = {
  domain: 'shopping-cart',
  entries: [{
    testName: 'add two items totals correctly',
    spans: [
      {
        name: 'cart.add',
        attributes: {
          'item.price': { kind: 'literal', value: 29.99 },
        },
      },
      {
        name: 'cart.totaled',
        attributes: {
          'cart.subtotal': { kind: 'literal', value: 39.99 },
        },
      },
    ],
  }],
}

// -- Tests --

describe('verifyContract', () => {
  describe('production-conformance: expectedSpansFound', () => {
    it('reports missing spans in production traces', () => {
      const traces: ProductionTrace[] = [
        {
          traceId: 'trace-1',
          spans: [
            { name: 'user.signup', attributes: { 'user.email': 'jane@co.com' } },
            { name: 'account.created', attributes: { 'account.email': 'jane@co.com' } },
          ],
        },
        {
          traceId: 'trace-2',
          spans: [
            { name: 'user.signup', attributes: { 'user.email': 'bob@co.com' } },
            // account.created missing!
          ],
        },
        {
          traceId: 'trace-3',
          spans: [
            { name: 'user.signup', attributes: { 'user.email': 'alice@co.com' } },
            // account.created missing!
          ],
        },
      ]

      const report = verifyContract(signupContract, traces)

      expect(report.domain).toBe('signup-flow')
      expect(report.results).toHaveLength(1)
      expect(report.results[0].tracesMatched).toBe(3)

      const missingSpans = report.results[0].violations.filter(v => v.kind === 'missing-span')
      expect(missingSpans).toHaveLength(2)
      expect(missingSpans[0]).toEqual({
        kind: 'missing-span',
        spanName: 'account.created',
        traceId: 'trace-2',
      })
    })
  })

  describe('production-conformance: boundValuesMatch', () => {
    it('reports correlation violations when emails differ', () => {
      const traces: ProductionTrace[] = [
        {
          traceId: 'trace-ok',
          spans: [
            { name: 'user.signup', attributes: { 'user.email': 'jane@co.com' } },
            { name: 'account.created', attributes: { 'account.email': 'jane@co.com' } },
          ],
        },
        {
          traceId: 'trace-bad',
          spans: [
            { name: 'user.signup', attributes: { 'user.email': 'jane@co.com' } },
            { name: 'account.created', attributes: { 'account.email': 'other@co.com' } },
          ],
        },
      ]

      const report = verifyContract(signupContract, traces)

      const correlationViolations = report.results[0].violations.filter(v => v.kind === 'correlation-violation')
      expect(correlationViolations).toHaveLength(1)
      expect(correlationViolations[0]).toMatchObject({
        kind: 'correlation-violation',
        symbol: '$email',
        traceId: 'trace-bad',
      })
    })

    it('passes when all correlated values match', () => {
      const traces: ProductionTrace[] = [
        {
          traceId: 'trace-1',
          spans: [
            { name: 'user.signup', attributes: { 'user.email': 'jane@co.com' } },
            { name: 'account.created', attributes: { 'account.email': 'jane@co.com' } },
          ],
        },
      ]

      const report = verifyContract(signupContract, traces)
      expect(report.totalViolations).toBe(0)
    })
  })

  describe('production-conformance: violationsFound', () => {
    it('reports literal attribute mismatches', () => {
      const traces: ProductionTrace[] = [
        {
          traceId: 'trace-1',
          spans: [
            { name: 'order.cancel', attributes: { 'order.status': 'pending' } },
          ],
        },
      ]

      const report = verifyContract(orderContract, traces)

      expect(report.totalViolations).toBe(1)
      expect(report.results[0].violations[0]).toEqual({
        kind: 'literal-mismatch',
        span: 'order.cancel',
        attribute: 'order.status',
        expected: 'cancelled',
        actual: 'pending',
        traceId: 'trace-1',
      })
    })

    it('derived values match on exact test params', () => {
      const traces: ProductionTrace[] = [
        {
          traceId: 'trace-match',
          spans: [
            { name: 'cart.add', attributes: { 'item.price': 29.99 } },
            { name: 'cart.totaled', attributes: { 'cart.subtotal': 39.99 } },
          ],
        },
        {
          traceId: 'trace-different-price',
          spans: [
            { name: 'cart.add', attributes: { 'item.price': 15.00 } },
            { name: 'cart.totaled', attributes: { 'cart.subtotal': 25.00 } },
          ],
        },
      ]

      const report = verifyContract(cartContract, traces)

      // trace-match: cart.add price matches (29.99), subtotal matches (39.99) → 0 violations
      // trace-different-price: cart.add price mismatches (15 != 29.99), subtotal mismatches (25 != 39.99) → 2 violations
      expect(report.results[0].tracesMatched).toBe(2)

      const literalMismatches = report.results[0].violations.filter(v => v.kind === 'literal-mismatch')
      expect(literalMismatches).toHaveLength(2)
      expect(literalMismatches.every(v => v.traceId === 'trace-different-price')).toBe(true)
    })

    it('zero violations when production conforms to contract', () => {
      const traces: ProductionTrace[] = [
        {
          traceId: 'trace-1',
          spans: [
            { name: 'order.cancel', attributes: { 'order.status': 'cancelled' } },
          ],
        },
      ]

      const report = verifyContract(orderContract, traces)
      expect(report.totalViolations).toBe(0)
      expect(report.results[0].tracesMatched).toBe(1)
    })

    it('backward compatible — contracts without parentName still work', () => {
      // Existing contracts without parentName should behave exactly as before
      const traces: ProductionTrace[] = [
        {
          traceId: 'trace-1',
          spans: [
            { name: 'order.cancel', attributes: { 'order.status': 'cancelled' } },
          ],
        },
      ]

      const report = verifyContract(orderContract, traces)
      expect(report.totalViolations).toBe(0)
      expect(report.results[0].tracesMatched).toBe(1)
    })

    it('reports no-matching-traces violation when anchor span is absent', () => {
      const traces: ProductionTrace[] = [
        {
          traceId: 'unrelated-trace',
          spans: [
            { name: 'payment.process', attributes: { 'amount': 100 } },
          ],
        },
      ]

      const report = verifyContract(signupContract, traces)
      expect(report.results[0].tracesMatched).toBe(0)
      expect(report.results[0].tracesChecked).toBe(1)
      expect(report.totalViolations).toBe(1)
      expect(report.results[0].violations[0]).toMatchObject({
        kind: 'no-matching-traces',
        anchorSpan: 'user.signup',
      })
    })
  })

  describe('span-hierarchy: parentName disambiguation', () => {
    it('disambiguates same-named spans with different parents', () => {
      // Contract expects two db.query spans under different parents
      const contract: BehavioralContract = {
        domain: 'layered-service',
        entries: [{
          testName: 'two queries from different layers',
          spans: [
            {
              name: 'service.handle',
              attributes: {},
            },
            {
              name: 'db.query',
              attributes: { 'db.statement': { kind: 'literal', value: 'SELECT users' } },
              parentName: 'service.handle',
            },
            {
              name: 'cache.check',
              attributes: {},
            },
            {
              name: 'db.query',
              attributes: { 'db.statement': { kind: 'literal', value: 'SELECT cache_keys' } },
              parentName: 'cache.check',
            },
          ],
        }],
      }

      const traces: ProductionTrace[] = [
        {
          traceId: 'trace-1',
          spans: [
            { name: 'service.handle', attributes: {}, spanId: 'span-1' },
            { name: 'db.query', attributes: { 'db.statement': 'SELECT users' }, spanId: 'span-2', parentSpanId: 'span-1' },
            { name: 'cache.check', attributes: {}, spanId: 'span-3' },
            { name: 'db.query', attributes: { 'db.statement': 'SELECT cache_keys' }, spanId: 'span-4', parentSpanId: 'span-3' },
          ],
        },
      ]

      const report = verifyContract(contract, traces)
      expect(report.totalViolations).toBe(0)
    })

    it('reports missing-span when parent constraint rejects candidate', () => {
      // Contract expects db.query under service.handle, but production has it under cache.check
      const contract: BehavioralContract = {
        domain: 'layered-service',
        entries: [{
          testName: 'query under wrong parent',
          spans: [
            {
              name: 'service.handle',
              attributes: {},
            },
            {
              name: 'db.query',
              attributes: { 'db.statement': { kind: 'literal', value: 'SELECT users' } },
              parentName: 'service.handle',
            },
          ],
        }],
      }

      const traces: ProductionTrace[] = [
        {
          traceId: 'trace-1',
          spans: [
            { name: 'service.handle', attributes: {}, spanId: 'span-1' },
            { name: 'cache.check', attributes: {}, spanId: 'span-2' },
            { name: 'db.query', attributes: { 'db.statement': 'SELECT users' }, spanId: 'span-3', parentSpanId: 'span-2' },
          ],
        },
      ]

      const report = verifyContract(contract, traces)
      expect(report.totalViolations).toBe(1)
      expect(report.results[0].violations[0]).toEqual({
        kind: 'missing-span',
        spanName: 'db.query',
        traceId: 'trace-1',
      })
    })

    it('does not reuse the same production span for multiple expectations', () => {
      // Contract expects two db.query spans, but production only has one
      const contract: BehavioralContract = {
        domain: 'layered-service',
        entries: [{
          testName: 'needs two queries',
          spans: [
            {
              name: 'service.handle',
              attributes: {},
            },
            {
              name: 'db.query',
              attributes: { 'db.statement': { kind: 'literal', value: 'SELECT a' } },
              parentName: 'service.handle',
            },
            {
              name: 'db.query',
              attributes: { 'db.statement': { kind: 'literal', value: 'SELECT b' } },
              parentName: 'service.handle',
            },
          ],
        }],
      }

      const traces: ProductionTrace[] = [
        {
          traceId: 'trace-1',
          spans: [
            { name: 'service.handle', attributes: {}, spanId: 'span-1' },
            { name: 'db.query', attributes: { 'db.statement': 'SELECT a' }, spanId: 'span-2', parentSpanId: 'span-1' },
          ],
        },
      ]

      const report = verifyContract(contract, traces)
      // The second db.query expectation should fail as missing
      const missing = report.results[0].violations.filter(v => v.kind === 'missing-span')
      expect(missing).toHaveLength(1)
      expect(missing[0].spanName).toBe('db.query')
    })
  })
})
