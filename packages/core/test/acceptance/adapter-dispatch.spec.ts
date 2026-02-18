import { describe, beforeEach } from 'vitest'
import { suite } from '../../src/index'
import { resetRegistry } from '../../src/core/registry'
import { averCore } from './domains/aver-core'
import { averCoreAdapter } from './adapters/aver-core.unit'

describe('Adapter dispatch and suite proxy', () => {
  const { test } = suite(averCore, averCoreAdapter)

  beforeEach(() => {
    resetRegistry()
  })

  test('dispatches actions through the suite proxy', async ({ act, assert }) => {
    await act.defineDomain({
      name: 'Dispatch',
      actions: ['submit'],
      queries: [],
      assertions: [],
    })
    await act.implementDomain()
    await act.registerAdapter()
    await act.createSuite()

    await act.executeAction({ name: 'submit' })

    await assert.traceContains({ kind: 'action', name: 'submit', status: 'pass' })
  })

  test('dispatches queries and returns typed results', async ({ act, assert }) => {
    await act.defineDomain({
      name: 'QueryTest',
      actions: [],
      queries: [{ name: 'count', returnType: 'number' }],
      assertions: [],
    })
    await act.implementDomain()
    await act.registerAdapter()
    await act.createSuite()

    await act.executeQuery({ name: 'count' })

    await assert.queryReturned({ name: 'count', value: 'result:count' })
    await assert.traceContains({ kind: 'query', name: 'count', status: 'pass' })
  })

  test('dispatches assertions through the suite proxy', async ({ act, assert }) => {
    await act.defineDomain({
      name: 'AssertTest',
      actions: [],
      queries: [],
      assertions: ['isValid'],
    })
    await act.implementDomain()
    await act.registerAdapter()
    await act.createSuite()

    await act.executeAssertion({ name: 'isValid' })

    await assert.traceContains({ kind: 'assertion', name: 'isValid', status: 'pass' })
  })

  // --- Multi-adapter dispatch ---

  test('parameterizes test names for multiple adapters', async ({ act, assert }) => {
    await act.defineDomain({
      name: 'MultiProto',
      actions: ['doSomething'],
      queries: [],
      assertions: [],
    })
    await act.implementDomain()
    await act.registerAdapter()
    await act.registerSecondAdapter({ protocolName: 'http' })
    await act.createSuite()

    await assert.testIsParameterized({ testName: 'my test', protocols: ['test-inner', 'http'] })
  })

  // --- Domain filtering ---

  test('skips tests when domain filter does not match', async ({ act, assert }) => {
    await act.defineDomain({
      name: 'Filtered',
      actions: ['doSomething'],
      queries: [],
      assertions: [],
    })
    await act.implementDomain()
    await act.registerAdapter()
    await act.createSuite()

    await act.setDomainFilter({ domainName: 'OtherDomain' })
    await assert.testIsSkipped({ testName: 'my test' })
    await act.clearDomainFilter()
  })
})
