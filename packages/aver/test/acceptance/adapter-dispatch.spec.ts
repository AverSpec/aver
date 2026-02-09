import { describe, beforeEach } from 'vitest'
import { suite } from '../../src/index'
import { resetRegistry } from '../../src/core/registry'
import { averCore } from './domains/aver-core'
import { averCoreAdapter } from './adapters/aver-core.direct'

describe('Adapter dispatch and suite proxy', () => {
  const { test } = suite(averCore, averCoreAdapter)

  beforeEach(() => {
    resetRegistry()
  })

  test('dispatches actions through the suite proxy', async ({ domain }) => {
    await domain.defineDomain({
      name: 'Dispatch',
      actions: ['submit'],
      queries: [],
      assertions: [],
    })
    await domain.implementDomain()
    await domain.registerAdapter()
    await domain.createSuite()

    await domain.executeAction({ name: 'submit' })

    await domain.traceContains({ kind: 'action', name: 'submit', status: 'pass' })
  })

  test('dispatches queries and returns typed results', async ({ domain }) => {
    await domain.defineDomain({
      name: 'QueryTest',
      actions: [],
      queries: [{ name: 'count', returnType: 'number' }],
      assertions: [],
    })
    await domain.implementDomain()
    await domain.registerAdapter()
    await domain.createSuite()

    await domain.executeQuery({ name: 'count' })

    await domain.queryReturned({ name: 'count', value: 'result:count' })
    await domain.traceContains({ kind: 'query', name: 'count', status: 'pass' })
  })

  test('dispatches assertions through the suite proxy', async ({ domain }) => {
    await domain.defineDomain({
      name: 'AssertTest',
      actions: [],
      queries: [],
      assertions: ['isValid'],
    })
    await domain.implementDomain()
    await domain.registerAdapter()
    await domain.createSuite()

    await domain.executeAssertion({ name: 'isValid' })

    await domain.traceContains({ kind: 'assertion', name: 'isValid', status: 'pass' })
  })
})
