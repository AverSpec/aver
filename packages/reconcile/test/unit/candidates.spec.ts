import { describe, it, expect } from 'vitest'
import { generateCandidates } from '../../src/candidates.js'
import type { UncoveredOperation, TelemetryEvent } from '../../src/types.js'

function makeEvent(overrides: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    schemaVersion: '1.0.0',
    domain: 'TestDomain',
    operation: 'doWork',
    kind: 'action',
    payload: {},
    timestamp: '2026-02-23T00:00:00Z',
    correlationId: 'test-correlation',
    environment: 'production',
    ...overrides,
  }
}

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

describe('generateCandidates', () => {
  it('generates one candidate per uncovered operation', () => {
    const uncovered = [
      makeUncovered({ operation: 'opA' }),
      makeUncovered({ operation: 'opB' }),
    ]
    const events = [
      makeEvent({ operation: 'opA' }),
      makeEvent({ operation: 'opB' }),
    ]

    const candidates = generateCandidates(uncovered, events)
    expect(candidates).toHaveLength(2)
  })

  it('candidate has correct source, deviation, behavior, and suggestedStage', () => {
    const uncovered = [makeUncovered({ operation: 'checkout', kind: 'action', eventCount: 7 })]
    const events = [makeEvent({ operation: 'checkout' })]

    const candidates = generateCandidates(uncovered, events)
    expect(candidates[0].source).toBe('production-reconciliation')
    expect(candidates[0].deviation).toBe('uncovered-operation')
    expect(candidates[0].behavior).toBe('Production action "checkout" has no scenario coverage (seen 7 times)')
    expect(candidates[0].suggestedStage).toBe('captured')
  })

  it('confidence is high for >= 10 events', () => {
    const uncovered = [makeUncovered({ eventCount: 10 })]
    const events = [makeEvent()]

    const candidates = generateCandidates(uncovered, events)
    expect(candidates[0].confidence).toBe('high')
  })

  it('confidence is high for > 10 events', () => {
    const uncovered = [makeUncovered({ eventCount: 50 })]
    const events = [makeEvent()]

    const candidates = generateCandidates(uncovered, events)
    expect(candidates[0].confidence).toBe('high')
  })

  it('confidence is medium for >= 3 events', () => {
    const uncovered = [makeUncovered({ eventCount: 3 })]
    const events = [makeEvent()]

    const candidates = generateCandidates(uncovered, events)
    expect(candidates[0].confidence).toBe('medium')
  })

  it('confidence is medium for events between 3 and 9', () => {
    const uncovered = [makeUncovered({ eventCount: 9 })]
    const events = [makeEvent()]

    const candidates = generateCandidates(uncovered, events)
    expect(candidates[0].confidence).toBe('medium')
  })

  it('confidence is low for < 3 events', () => {
    const uncovered = [makeUncovered({ eventCount: 2 })]
    const events = [makeEvent()]

    const candidates = generateCandidates(uncovered, events)
    expect(candidates[0].confidence).toBe('low')
  })

  it('confidence is low for 1 event', () => {
    const uncovered = [makeUncovered({ eventCount: 1 })]
    const events = [makeEvent()]

    const candidates = generateCandidates(uncovered, events)
    expect(candidates[0].confidence).toBe('low')
  })

  it('evidence includes up to 5 related events', () => {
    const uncovered = [makeUncovered({ operation: 'bigOp', eventCount: 8 })]
    const events = Array.from({ length: 8 }, (_, i) =>
      makeEvent({ operation: 'bigOp', correlationId: `corr-${i}` }),
    )

    const candidates = generateCandidates(uncovered, events)
    expect(candidates[0].evidence.operations).toHaveLength(5)
    expect(candidates[0].evidence.eventCount).toBe(8)
  })

  it('evidence includes all events when fewer than 5', () => {
    const uncovered = [makeUncovered({ operation: 'smallOp', eventCount: 2 })]
    const events = [
      makeEvent({ operation: 'smallOp', correlationId: 'a' }),
      makeEvent({ operation: 'smallOp', correlationId: 'b' }),
    ]

    const candidates = generateCandidates(uncovered, events)
    expect(candidates[0].evidence.operations).toHaveLength(2)
  })

  it('returns empty array when no uncovered operations', () => {
    const candidates = generateCandidates([], [])
    expect(candidates).toEqual([])
  })
})
