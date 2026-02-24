import { describe, it, expect } from 'vitest'
import { fingerprint, deduplicate } from '../../src/fingerprint.js'
import type { UncoveredOperation } from '../../src/types.js'

function makeUncovered(overrides: Partial<UncoveredOperation> = {}): UncoveredOperation {
  return {
    domain: 'TestDomain',
    operation: 'doWork',
    kind: 'action',
    eventCount: 5,
    firstSeen: '2026-02-23T00:00:00Z',
    lastSeen: '2026-02-23T05:00:00Z',
    ...overrides,
  }
}

describe('fingerprint', () => {
  it('generates a deterministic fingerprint', () => {
    const op = makeUncovered()
    const fp1 = fingerprint(op)
    const fp2 = fingerprint(op)
    expect(fp1).toBe(fp2)
  })

  it('same domain+kind+operation produces the same fingerprint', () => {
    const op1 = makeUncovered({ eventCount: 1, firstSeen: '2026-01-01T00:00:00Z' })
    const op2 = makeUncovered({ eventCount: 100, firstSeen: '2026-02-01T00:00:00Z' })
    expect(fingerprint(op1)).toBe(fingerprint(op2))
  })

  it('different operations produce different fingerprints', () => {
    const op1 = makeUncovered({ operation: 'opA' })
    const op2 = makeUncovered({ operation: 'opB' })
    expect(fingerprint(op1)).not.toBe(fingerprint(op2))
  })

  it('different kinds produce different fingerprints', () => {
    const op1 = makeUncovered({ kind: 'action' })
    const op2 = makeUncovered({ kind: 'query' })
    expect(fingerprint(op1)).not.toBe(fingerprint(op2))
  })

  it('different domains produce different fingerprints', () => {
    const op1 = makeUncovered({ domain: 'DomainA' })
    const op2 = makeUncovered({ domain: 'DomainB' })
    expect(fingerprint(op1)).not.toBe(fingerprint(op2))
  })

  it('produces expected format: domain:kind:operation', () => {
    const op = makeUncovered({ domain: 'MyDomain', kind: 'query', operation: 'getItems' })
    expect(fingerprint(op)).toBe('MyDomain:query:getItems')
  })
})

describe('deduplicate', () => {
  it('keeps the entry with the highest event count', () => {
    const ops = [
      makeUncovered({ eventCount: 3 }),
      makeUncovered({ eventCount: 10 }),
      makeUncovered({ eventCount: 5 }),
    ]

    const result = deduplicate(ops)
    expect(result).toHaveLength(1)
    expect(result[0].eventCount).toBe(10)
  })

  it('preserves operations with different fingerprints', () => {
    const ops = [
      makeUncovered({ operation: 'opA', eventCount: 3 }),
      makeUncovered({ operation: 'opB', eventCount: 5 }),
    ]

    const result = deduplicate(ops)
    expect(result).toHaveLength(2)
  })

  it('returns empty array for empty input', () => {
    const result = deduplicate([])
    expect(result).toEqual([])
  })

  it('handles single entry', () => {
    const ops = [makeUncovered()]
    const result = deduplicate(ops)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(ops[0])
  })

  it('deduplicates across different event counts keeping the highest', () => {
    const ops = [
      makeUncovered({ domain: 'D', operation: 'op', kind: 'action', eventCount: 2 }),
      makeUncovered({ domain: 'D', operation: 'op', kind: 'action', eventCount: 8 }),
      makeUncovered({ domain: 'D', operation: 'other', kind: 'action', eventCount: 1 }),
    ]

    const result = deduplicate(ops)
    expect(result).toHaveLength(2)
    const opEntry = result.find(r => r.operation === 'op')
    expect(opEntry!.eventCount).toBe(8)
  })
})
