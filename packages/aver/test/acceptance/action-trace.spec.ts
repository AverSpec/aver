import { describe, beforeEach } from 'vitest'
import { suite } from '../../src/index'
import { resetRegistry } from '../../src/core/registry'
import { averCore } from './domains/aver-core'
import { averCoreAdapter } from './adapters/aver-core.direct'

describe('Action trace and error reporting', () => {
  const { test } = suite(averCore, averCoreAdapter)

  beforeEach(() => {
    resetRegistry()
  })

  test('records a complete action trace across multiple operations', async ({ domain }) => {
    await domain.defineDomain({
      name: 'TraceTest',
      actions: ['doA'],
      queries: [{ name: 'getB', returnType: 'string' }],
      assertions: ['checkC'],
    })
    await domain.implementDomain()
    await domain.registerAdapter()
    await domain.createSuite()

    await domain.executeAction({ name: 'doA' })
    await domain.executeQuery({ name: 'getB' })
    await domain.executeAssertion({ name: 'checkC' })

    await domain.traceHasLength({ length: 3 })
    await domain.traceContains({ kind: 'action', name: 'doA', status: 'pass' })
    await domain.traceContains({ kind: 'query', name: 'getB', status: 'pass' })
    await domain.traceContains({ kind: 'assertion', name: 'checkC', status: 'pass' })
  })

  test('records failure status in trace when assertion fails', async ({ domain }) => {
    await domain.defineDomain({
      name: 'FailTrace',
      actions: ['setup'],
      queries: [],
      assertions: ['verify'],
    })
    await domain.implementDomain()
    await domain.registerAdapter()
    await domain.createSuite()

    await domain.executeAction({ name: 'setup' })
    await domain.executeFailingAssertion({ name: 'verify' })

    await domain.traceContains({ kind: 'action', name: 'setup', status: 'pass' })
    await domain.traceContains({ kind: 'assertion', name: 'verify', status: 'fail' })
  })
})
