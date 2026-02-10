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

  test('extended domain inherits parent vocabulary and adds new items', async ({ act, assert }) => {
    await act.defineDomain({
      name: 'Base',
      actions: ['doA'],
      queries: [],
      assertions: ['checkA'],
    })

    await act.extendDomain({
      assertions: ['checkB'],
    })

    await assert.hasVocabulary({
      actions: ['doA'],
      queries: [],
      assertions: ['checkA', 'checkB'],
    })
  })

  test('extended domain tracks its parent', async ({ act, assert }) => {
    await act.defineDomain({
      name: 'ParentDomain',
      actions: [],
      queries: [],
      assertions: [],
    })

    await act.extendDomain({
      assertions: ['extra'],
    })

    await assert.hasParent({ name: 'ParentDomain' })
  })

  test('extended domain can be implemented and used in a suite', async ({ act, assert }) => {
    await act.defineDomain({
      name: 'ExtImpl',
      actions: ['create'],
      queries: [],
      assertions: ['exists'],
    })

    await act.extendDomain({
      assertions: ['isVisible'],
    })

    await act.implementDomain()
    await act.registerAdapter()
    await act.createSuite()

    await act.executeAction({ name: 'create' })
    await act.executeAssertion({ name: 'exists' })
    await act.executeAssertion({ name: 'isVisible' })

    await assert.traceHasLength({ length: 3 })
  })
})
