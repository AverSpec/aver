import { describe, beforeEach } from 'vitest'
import { suite } from '../../src/index'
import { resetRegistry } from '../../src/core/registry'
import { averCore } from './domains/aver-core'
import { averCoreAdapter } from './adapters/aver-core.unit'

describe('Domain extensions', () => {
  const { test } = suite(averCore, averCoreAdapter)

  beforeEach(() => {
    resetRegistry()
  })

  test('extended domain inherits parent vocabulary and adds new items', async ({ given, then }) => {
    await given.defineDomain({
      name: 'Base',
      actions: ['doA'],
      queries: [],
      assertions: ['checkA'],
    })

    await given.extendDomain({
      assertions: ['checkB'],
    })

    await then.hasVocabulary({
      actions: ['doA'],
      queries: [],
      assertions: ['checkA', 'checkB'],
    })
  })

  test('extended domain tracks its parent', async ({ given, then }) => {
    await given.defineDomain({
      name: 'ParentDomain',
      actions: [],
      queries: [],
      assertions: [],
    })

    await given.extendDomain({
      assertions: ['extra'],
    })

    await then.hasParent({ name: 'ParentDomain' })
  })

  test('extended domain can be implemented and used in a suite', async ({ given, when, then }) => {
    await given.defineDomain({
      name: 'ExtImpl',
      actions: ['create'],
      queries: [],
      assertions: ['exists'],
    })

    await given.extendDomain({
      assertions: ['isVisible'],
    })

    await given.implementDomain()
    await given.registerAdapter()
    await given.createSuite()

    await when.executeAction({ name: 'create' })
    await when.executeAssertion({ name: 'exists' })
    await when.executeAssertion({ name: 'isVisible' })

    await then.traceHasLength({ length: 3 })
  })
})
