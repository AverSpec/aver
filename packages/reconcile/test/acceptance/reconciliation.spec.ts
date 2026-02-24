import { describe, expect } from 'vitest'
import { suite } from '@aver/core'
import { reconciliation } from './domains/reconciliation'
import { reconciliationAdapter } from './adapters/reconciliation.unit'

describe('Reconciliation', () => {
  const { test } = suite(reconciliation, reconciliationAdapter)

  test('loads events and runs reconciliation with no events', async ({ act, assert, query }) => {
    await act.loadProductionEvents({ events: [] })
    await act.runReconciliation({ domainName: 'TestApp' })
    await assert.noUncoveredOperations()
    await assert.coverageAbove({ threshold: 100 })
  })

  test('detects uncovered operations from production events', async ({ act, assert, query }) => {
    await act.loadProductionEvents({
      events: [
        {
          schemaVersion: '1.0.0',
          domain: 'TestApp',
          operation: 'createOrder',
          kind: 'action',
          payload: { item: 'widget' },
          timestamp: '2026-02-23T00:00:00Z',
          correlationId: 'corr-1',
          environment: 'production',
        },
        {
          schemaVersion: '1.0.0',
          domain: 'TestApp',
          operation: 'cancelOrder',
          kind: 'action',
          payload: { orderId: '123' },
          timestamp: '2026-02-23T01:00:00Z',
          correlationId: 'corr-2',
          environment: 'production',
        },
      ],
    })
    await act.runReconciliation({ domainName: 'TestApp' })

    const uncovered = await query.uncoveredOperations()
    expect(uncovered.length).toBe(2)
    await assert.candidateGenerated({ operation: 'createOrder' })
    await assert.candidateGenerated({ operation: 'cancelOrder' })
  })

  test('generates candidates from uncovered operations', async ({ act, query }) => {
    await act.loadProductionEvents({
      events: [
        {
          schemaVersion: '1.0.0',
          domain: 'TestApp',
          operation: 'updateOrder',
          kind: 'action',
          payload: {},
          timestamp: '2026-02-23T00:00:00Z',
          correlationId: 'corr-1',
          environment: 'production',
        },
      ],
    })
    await act.runReconciliation({ domainName: 'TestApp' })

    const count = await query.candidateCount()
    expect(count).toBe(1)
  })

  test('excludes covered operations from uncovered list', async ({ act, assert, query }) => {
    await act.loadScenarios({
      scenarios: [
        { id: 'sc-1', behavior: 'create an order', domainOperation: 'createOrder' },
      ],
    })
    await act.loadProductionEvents({
      events: [
        {
          schemaVersion: '1.0.0',
          domain: 'TestApp',
          operation: 'createOrder',
          kind: 'action',
          payload: {},
          timestamp: '2026-02-23T00:00:00Z',
          correlationId: 'corr-1',
          environment: 'production',
        },
        {
          schemaVersion: '1.0.0',
          domain: 'TestApp',
          operation: 'cancelOrder',
          kind: 'action',
          payload: {},
          timestamp: '2026-02-23T01:00:00Z',
          correlationId: 'corr-2',
          environment: 'production',
        },
      ],
    })
    await act.runReconciliation({ domainName: 'TestApp' })

    // createOrder is covered by a scenario, cancelOrder is not
    const uncovered = await query.uncoveredOperations()
    expect(uncovered.length).toBe(1)
    expect(uncovered[0].operation).toBe('cancelOrder')

    // Coverage: 1 covered / 2 total = 50%
    const pct = await query.coveragePercentage()
    expect(pct).toBe(50)

    await assert.coverageAbove({ threshold: 40 })
  })

  test('coverage percentage is calculated correctly', async ({ act, query }) => {
    // With 3 different operations and 0 scenarios, coverage should be 0%
    await act.loadProductionEvents({
      events: [
        {
          schemaVersion: '1.0.0',
          domain: 'TestApp',
          operation: 'createOrder',
          kind: 'action',
          payload: {},
          timestamp: '2026-02-23T00:00:00Z',
          correlationId: 'corr-1',
          environment: 'production',
        },
        {
          schemaVersion: '1.0.0',
          domain: 'TestApp',
          operation: 'cancelOrder',
          kind: 'action',
          payload: {},
          timestamp: '2026-02-23T01:00:00Z',
          correlationId: 'corr-2',
          environment: 'production',
        },
        {
          schemaVersion: '1.0.0',
          domain: 'TestApp',
          operation: 'getOrder',
          kind: 'query',
          payload: {},
          timestamp: '2026-02-23T02:00:00Z',
          correlationId: 'corr-3',
          environment: 'production',
        },
      ],
    })
    await act.runReconciliation({ domainName: 'TestApp' })

    const percentage = await query.coveragePercentage()
    expect(percentage).toBe(0)
  })
})
