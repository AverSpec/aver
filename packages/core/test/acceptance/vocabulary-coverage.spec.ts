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

  test('reports 100% when all operations exercised', async ({ given, when, then }) => {
    await given.defineDomain({
      name: 'FullCov',
      actions: ['doIt'],
      queries: [{ name: 'getIt', returnType: 'string' }],
      assertions: ['checkIt'],
    })
    await given.implementDomain()
    await given.registerAdapter()
    await given.createSuite()

    await when.executeAction({ name: 'doIt' })
    await when.executeQuery({ name: 'getIt' })
    await when.executeAssertion({ name: 'checkIt' })

    await then.coverageIsPercent({ percentage: 100 })
  })

  test('reports partial coverage when some operations uncalled', async ({ given, when, then }) => {
    await given.defineDomain({
      name: 'PartialCov',
      actions: ['a1', 'a2'],
      queries: [{ name: 'q1', returnType: 'string' }],
      assertions: ['c1'],
    })
    await given.implementDomain()
    await given.registerAdapter()
    await given.createSuite()

    await when.executeAction({ name: 'a1' })
    // a2, q1, c1 not called — 1 of 4 = 25%

    await then.coverageIsPercent({ percentage: 25 })
    await then.operationIsCovered({ kind: 'action', name: 'a1' })
    await then.operationIsUncovered({ kind: 'action', name: 'a2' })
    await then.operationIsUncovered({ kind: 'query', name: 'q1' })
    await then.operationIsUncovered({ kind: 'assertion', name: 'c1' })
  })

  test('reports 100% for domain with no operations', async ({ given, then }) => {
    await given.defineDomain({
      name: 'EmptyCov',
      actions: [],
      queries: [],
      assertions: [],
    })
    await given.implementDomain()
    await given.registerAdapter()
    await given.createSuite()

    await then.coverageIsPercent({ percentage: 100 })
  })

  test('does not double-count repeated calls to the same operation', async ({ given, when, then }) => {
    await given.defineDomain({
      name: 'DedupCov',
      actions: ['submit'],
      queries: [{ name: 'total', returnType: 'number' }],
      assertions: ['valid'],
    })
    await given.implementDomain()
    await given.registerAdapter()
    await given.createSuite()

    await when.executeAction({ name: 'submit' })
    await when.executeAction({ name: 'submit' })
    await when.executeQuery({ name: 'total' })

    // 2 of 3 operations covered (submit + total, but not valid)
    await then.coverageIsPercent({ percentage: 67 })
  })
})
