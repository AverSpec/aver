import { describe, it, expect } from 'vitest'
import { defineDomain, action, query, assertion } from '@aver/core'
import { reconcile } from '../../src/reconcile.js'
import type { TelemetryEvent, ScenarioRef } from '../../src/types.js'

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

const testDomain = defineDomain({
  name: 'TestDomain',
  actions: {
    doWork: action(),
    doOther: action(),
  },
  queries: {
    getStatus: query<void, string>(),
  },
  assertions: {
    isComplete: assertion(),
  },
})

describe('reconcile', () => {
  it('returns empty uncovered operations and 100% coverage with no events', () => {
    const result = reconcile({
      domain: testDomain,
      scenarios: [],
      events: [],
    })

    expect(result.uncoveredOperations).toEqual([])
    expect(result.candidates).toEqual([])
    expect(result.coverage.covered).toBe(0)
    expect(result.coverage.uncovered).toBe(0)
    expect(result.coverage.percentage).toBe(100)
    expect(result.schemaVersion).toBe('1.0.0')
    expect(result.domain).toBe('TestDomain')
  })

  it('reports all covered when events match scenario-covered operations', () => {
    const scenarios: ScenarioRef[] = [
      { id: 's1', behavior: 'does work', domainOperation: 'doWork' },
    ]
    const events = [
      makeEvent({ operation: 'doWork' }),
      makeEvent({ operation: 'doWork', timestamp: '2026-02-23T01:00:00Z' }),
    ]

    const result = reconcile({
      domain: testDomain,
      scenarios,
      events,
    })

    expect(result.uncoveredOperations).toEqual([])
    expect(result.coverage.covered).toBe(1)
    expect(result.coverage.uncovered).toBe(0)
    expect(result.coverage.percentage).toBe(100)
  })

  it('reports uncovered operations with correct counts when no scenario coverage', () => {
    const events = [
      makeEvent({ operation: 'doWork', timestamp: '2026-02-23T00:00:00Z' }),
      makeEvent({ operation: 'doWork', timestamp: '2026-02-23T01:00:00Z' }),
      makeEvent({ operation: 'doWork', timestamp: '2026-02-23T02:00:00Z' }),
    ]

    const result = reconcile({
      domain: testDomain,
      scenarios: [],
      events,
    })

    expect(result.uncoveredOperations).toHaveLength(1)
    expect(result.uncoveredOperations[0]).toMatchObject({
      domain: 'TestDomain',
      operation: 'doWork',
      kind: 'action',
      eventCount: 3,
      firstSeen: '2026-02-23T00:00:00Z',
      lastSeen: '2026-02-23T02:00:00Z',
    })
  })

  it('calculates correct coverage percentage with mixed covered/uncovered', () => {
    const scenarios: ScenarioRef[] = [
      { id: 's1', behavior: 'does work', domainOperation: 'doWork' },
    ]
    const events = [
      makeEvent({ operation: 'doWork' }),
      makeEvent({ operation: 'doOther' }),
      makeEvent({ operation: 'getStatus', kind: 'query' }),
    ]

    const result = reconcile({
      domain: testDomain,
      scenarios,
      events,
    })

    expect(result.coverage.covered).toBe(1)
    expect(result.coverage.uncovered).toBe(2)
    expect(result.coverage.percentage).toBe(33.3)
    expect(result.uncoveredOperations).toHaveLength(2)
  })

  it('filters events by domain name, ignoring events from other domains', () => {
    const events = [
      makeEvent({ domain: 'TestDomain', operation: 'doWork' }),
      makeEvent({ domain: 'OtherDomain', operation: 'doWork' }),
      makeEvent({ domain: 'OtherDomain', operation: 'foreignOp' }),
    ]

    const result = reconcile({
      domain: testDomain,
      scenarios: [],
      events,
    })

    // Only the TestDomain event should be counted
    expect(result.uncoveredOperations).toHaveLength(1)
    expect(result.uncoveredOperations[0].domain).toBe('TestDomain')
    expect(result.uncoveredOperations[0].operation).toBe('doWork')
    expect(result.coverage.uncovered).toBe(1)
  })

  it('uses domain vocabulary kind when available', () => {
    const events = [
      makeEvent({ operation: 'getStatus', kind: 'action' }), // event says action, domain says query
    ]

    const result = reconcile({
      domain: testDomain,
      scenarios: [],
      events,
    })

    // Should use the domain vocabulary kind (query), not the event kind (action)
    expect(result.uncoveredOperations[0].kind).toBe('query')
  })

  it('generates candidates for each uncovered operation', () => {
    const events = [
      makeEvent({ operation: 'doWork' }),
      makeEvent({ operation: 'doOther' }),
    ]

    const result = reconcile({
      domain: testDomain,
      scenarios: [],
      events,
    })

    expect(result.candidates).toHaveLength(2)
    expect(result.candidates[0].source).toBe('production-reconciliation')
    expect(result.candidates[0].deviation).toBe('uncovered-operation')
    expect(result.candidates[0].suggestedStage).toBe('captured')
  })
})
