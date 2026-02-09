import { describe, beforeEach } from 'vitest'
import { suite } from '../../src/index'
import { resetRegistry } from '../../src/core/registry'
import { averCore } from './domains/aver-core'
import { averCoreAdapter } from './adapters/aver-core.direct'

describe('Domain extensions', () => {
  const { test } = suite(averCore, averCoreAdapter)

  beforeEach(() => {
    resetRegistry()
  })

  test('extended domain inherits parent vocabulary and adds new items', async ({ domain }) => {
    await domain.defineDomain({
      name: 'Base',
      actions: ['doA'],
      queries: [],
      assertions: ['checkA'],
    })

    await domain.extendDomain({
      assertions: ['checkB'],
    })

    await domain.hasVocabulary({
      actions: ['doA'],
      queries: [],
      assertions: ['checkA', 'checkB'],
    })
  })

  test('extended domain tracks its parent', async ({ domain }) => {
    await domain.defineDomain({
      name: 'ParentDomain',
      actions: [],
      queries: [],
      assertions: [],
    })

    await domain.extendDomain({
      assertions: ['extra'],
    })

    await domain.hasParent({ name: 'ParentDomain' })
  })

  test('extended domain can be implemented and used in a suite', async ({ domain }) => {
    await domain.defineDomain({
      name: 'ExtImpl',
      actions: ['create'],
      queries: [],
      assertions: ['exists'],
    })

    await domain.extendDomain({
      assertions: ['isVisible'],
    })

    await domain.implementDomain()
    await domain.registerAdapter()
    await domain.createSuite()

    await domain.executeAction({ name: 'create' })
    await domain.executeAssertion({ name: 'exists' })
    await domain.executeAssertion({ name: 'isVisible' })

    await domain.traceHasLength({ length: 3 })
  })
})
