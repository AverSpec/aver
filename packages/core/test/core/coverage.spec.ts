import { describe, it, expect } from 'vitest'
import { computeCoverage } from '../../src/core/coverage'

describe('computeCoverage()', () => {
  it('computes 100% when all operations called', () => {
    const result = computeCoverage(
      'Cart',
      ['addItem', 'removeItem'],
      ['total'],
      ['isEmpty'],
      new Set(['addItem', 'removeItem']),
      new Set(['total']),
      new Set(['isEmpty']),
    )

    expect(result.domain).toBe('Cart')
    expect(result.actions).toEqual({ total: ['addItem', 'removeItem'], called: ['addItem', 'removeItem'] })
    expect(result.queries).toEqual({ total: ['total'], called: ['total'] })
    expect(result.assertions).toEqual({ total: ['isEmpty'], called: ['isEmpty'] })
    expect(result.percentage).toBe(100)
  })

  it('computes 0% when no operations called', () => {
    const result = computeCoverage(
      'Cart',
      ['addItem'],
      ['total'],
      ['isEmpty'],
      new Set(),
      new Set(),
      new Set(),
    )

    expect(result.percentage).toBe(0)
    expect(result.actions.called).toEqual([])
  })

  it('computes partial coverage', () => {
    const result = computeCoverage(
      'Cart',
      ['addItem', 'removeItem'],
      ['total', 'count'],
      [],
      new Set(['addItem']),
      new Set(['total']),
      new Set(),
    )

    expect(result.percentage).toBe(50)
  })

  it('returns 100% for empty domain', () => {
    const result = computeCoverage('Empty', [], [], [], new Set(), new Set(), new Set())
    expect(result.percentage).toBe(100)
  })
})
