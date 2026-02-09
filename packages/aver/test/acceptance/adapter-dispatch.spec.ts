import { describe, it, beforeEach, afterEach } from 'vitest'
import { suite } from '../../src/index'
import { _resetRegistry, _registerAdapter } from '../../src/core/registry'
import { averCore } from './domains/aver-core'
import { averCoreAdapter } from './adapters/aver-core.direct'

describe('Adapter dispatch and suite proxy', () => {
  const s = suite(averCore)

  beforeEach(async () => {
    _resetRegistry()
    _registerAdapter(averCoreAdapter)
    await s._setupForTest()
  })

  afterEach(async () => {
    await s._teardownForTest()
  })

  it('dispatches actions through the suite proxy', async () => {
    await s.domain.defineDomain({
      name: 'Dispatch',
      actions: ['submit'],
      queries: [],
      assertions: [],
    })
    await s.domain.implementDomain()
    await s.domain.registerAdapter()
    await s.domain.createSuite()

    await s.domain.executeAction({ name: 'submit' })

    await s.domain.traceContains({ kind: 'action', name: 'submit', status: 'pass' })
  })

  it('dispatches queries and returns typed results', async () => {
    await s.domain.defineDomain({
      name: 'QueryTest',
      actions: [],
      queries: [{ name: 'count', returnType: 'number' }],
      assertions: [],
    })
    await s.domain.implementDomain()
    await s.domain.registerAdapter()
    await s.domain.createSuite()

    await s.domain.executeQuery({ name: 'count' })

    await s.domain.queryReturned({ name: 'count', value: 'result:count' })
    await s.domain.traceContains({ kind: 'query', name: 'count', status: 'pass' })
  })

  it('dispatches assertions through the suite proxy', async () => {
    await s.domain.defineDomain({
      name: 'AssertTest',
      actions: [],
      queries: [],
      assertions: ['isValid'],
    })
    await s.domain.implementDomain()
    await s.domain.registerAdapter()
    await s.domain.createSuite()

    await s.domain.executeAssertion({ name: 'isValid' })

    await s.domain.traceContains({ kind: 'assertion', name: 'isValid', status: 'pass' })
  })
})
