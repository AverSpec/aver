import { describe, beforeEach } from 'vitest'
import { suite } from '../../src/index'
import { resetRegistry } from '../../src/core/registry'
import { averCore } from './domains/aver-core'
import { averCoreAdapter } from './adapters/aver-core.unit'

describe('Action trace and error reporting', () => {
  const { test } = suite(averCore, averCoreAdapter)

  beforeEach(() => {
    resetRegistry()
  })

  test('records a complete action trace across multiple operations', async ({ given, when, then }) => {
    await given.defineDomain({
      name: 'TraceTest',
      actions: ['doA'],
      queries: [{ name: 'getB', returnType: 'string' }],
      assertions: ['checkC'],
    })
    await given.implementDomain()
    await given.registerAdapter()
    await given.createSuite()

    await when.executeAction({ name: 'doA' })
    await when.executeQuery({ name: 'getB' })
    await when.executeAssertion({ name: 'checkC' })

    await then.traceHasLength({ length: 3 })
    await then.traceContains({ kind: 'action', name: 'doA', status: 'pass' })
    await then.traceContains({ kind: 'query', name: 'getB', status: 'pass' })
    await then.traceContains({ kind: 'assertion', name: 'checkC', status: 'pass' })
  })

  test('records failure status in trace when assertion fails', async ({ given, when, then }) => {
    await given.defineDomain({
      name: 'FailTrace',
      actions: ['setup'],
      queries: [],
      assertions: ['verify'],
    })
    await given.implementDomain()
    await given.registerAdapter()
    await given.createSuite()

    await when.executeAction({ name: 'setup' })
    await when.executeFailingAssertion({ name: 'verify' })

    await then.traceContains({ kind: 'action', name: 'setup', status: 'pass' })
    await then.traceContains({ kind: 'assertion', name: 'verify', status: 'fail' })
  })

  test('records categorized trace with given/when/then', async ({ given, when, then }) => {
    await given.defineDomain({
      name: 'CategoryTrace',
      actions: ['setup', 'trigger'],
      queries: [],
      assertions: ['verify'],
    })
    await given.implementDomain()
    await given.registerAdapter()
    await given.createSuite()

    await when.executeAction({ name: 'setup' })
    await when.executeAction({ name: 'trigger' })
    await when.executeAssertion({ name: 'verify' })

    await then.traceHasLength({ length: 3 })
    await then.traceContains({ kind: 'action', name: 'setup', status: 'pass' })
    await then.traceContains({ kind: 'action', name: 'trigger', status: 'pass' })
    await then.traceContains({ kind: 'assertion', name: 'verify', status: 'pass' })
  })
})
