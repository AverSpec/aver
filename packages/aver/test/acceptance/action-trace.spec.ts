import { describe, it, beforeEach, afterEach } from 'vitest'
import { suite } from '../../src/index'
import { _resetRegistry, _registerAdapter } from '../../src/core/registry'
import { averCore } from './domains/aver-core'
import { averCoreAdapter } from './adapters/aver-core.direct'

describe('Action trace and error reporting', () => {
  const s = suite(averCore)

  beforeEach(async () => {
    _resetRegistry()
    _registerAdapter(averCoreAdapter)
    await s._setupForTest()
  })

  afterEach(async () => {
    await s._teardownForTest()
  })

  it('records a complete action trace across multiple operations', async () => {
    await s.domain.defineDomain({
      name: 'TraceTest',
      actions: ['doA'],
      queries: [{ name: 'getB', returnType: 'string' }],
      assertions: ['checkC'],
    })
    await s.domain.implementDomain()
    await s.domain.registerAdapter()
    await s.domain.createSuite()

    await s.domain.executeAction({ name: 'doA' })
    await s.domain.executeQuery({ name: 'getB' })
    await s.domain.executeAssertion({ name: 'checkC' })

    await s.domain.traceHasLength({ length: 3 })
    await s.domain.traceContains({ kind: 'action', name: 'doA', status: 'pass' })
    await s.domain.traceContains({ kind: 'query', name: 'getB', status: 'pass' })
    await s.domain.traceContains({ kind: 'assertion', name: 'checkC', status: 'pass' })
  })

  it('records failure status in trace when assertion fails', async () => {
    await s.domain.defineDomain({
      name: 'FailTrace',
      actions: ['setup'],
      queries: [],
      assertions: ['verify'],
    })
    await s.domain.implementDomain()
    await s.domain.registerAdapter()
    await s.domain.createSuite()

    await s.domain.executeAction({ name: 'setup' })
    await s.domain.executeFailingAssertion({ name: 'verify' })

    await s.domain.traceContains({ kind: 'action', name: 'setup', status: 'pass' })
    await s.domain.traceContains({ kind: 'assertion', name: 'verify', status: 'fail' })
  })
})
