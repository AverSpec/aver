import { describe, beforeEach } from 'vitest'
import { suite } from '../../src/index'
import { resetRegistry } from '../../src/core/registry'
import { averCore } from './domains/aver-core'
import { averCoreAdapter } from './adapters/aver-core.unit'

describe('Vocabulary coverage', () => {
  const { test } = suite(averCore, averCoreAdapter)

  beforeEach(() => {
    resetRegistry()
  })

  test('reports 100% when all operations exercised', async ({ act, assert }) => {
    await act.defineDomain({
      name: 'FullCov',
      actions: ['doIt'],
      queries: [{ name: 'getIt', returnType: 'string' }],
      assertions: ['checkIt'],
    })
    await act.implementDomain()
    await act.registerAdapter()
    await act.createSuite()

    await act.executeAction({ name: 'doIt' })
    await act.executeQuery({ name: 'getIt' })
    await act.executeAssertion({ name: 'checkIt' })

    await assert.coverageIsPercent({ percentage: 100 })
  })

  test('reports partial coverage when some operations uncalled', async ({ act, assert }) => {
    await act.defineDomain({
      name: 'PartialCov',
      actions: ['a1', 'a2'],
      queries: [{ name: 'q1', returnType: 'string' }],
      assertions: ['c1'],
    })
    await act.implementDomain()
    await act.registerAdapter()
    await act.createSuite()

    await act.executeAction({ name: 'a1' })
    // a2, q1, c1 not called — 1 of 4 = 25%

    await assert.coverageIsPercent({ percentage: 25 })
    await assert.operationIsCovered({ kind: 'action', name: 'a1' })
    await assert.operationIsUncovered({ kind: 'action', name: 'a2' })
    await assert.operationIsUncovered({ kind: 'query', name: 'q1' })
    await assert.operationIsUncovered({ kind: 'assertion', name: 'c1' })
  })

  test('reports 100% for domain with no operations', async ({ act, assert }) => {
    await act.defineDomain({
      name: 'EmptyCov',
      actions: [],
      queries: [],
      assertions: [],
    })
    await act.implementDomain()
    await act.registerAdapter()
    await act.createSuite()

    await assert.coverageIsPercent({ percentage: 100 })
  })

  test('does not double-count repeated calls to the same operation', async ({ act, assert }) => {
    await act.defineDomain({
      name: 'DedupCov',
      actions: ['submit'],
      queries: [{ name: 'total', returnType: 'number' }],
      assertions: ['valid'],
    })
    await act.implementDomain()
    await act.registerAdapter()
    await act.createSuite()

    await act.executeAction({ name: 'submit' })
    await act.executeAction({ name: 'submit' })
    await act.executeQuery({ name: 'total' })

    // 2 of 3 operations covered (submit + total, but not valid)
    await assert.coverageIsPercent({ percentage: 67 })
  })
})
