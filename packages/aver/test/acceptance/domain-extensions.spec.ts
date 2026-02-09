import { describe, it, beforeEach, afterEach } from 'vitest'
import { suite } from '../../src/index'
import { _resetRegistry, _registerAdapter } from '../../src/core/registry'
import { averCore } from './domains/aver-core'
import { averCoreAdapter } from './adapters/aver-core.direct'

describe('Domain extensions', () => {
  const s = suite(averCore)

  beforeEach(async () => {
    _resetRegistry()
    _registerAdapter(averCoreAdapter)
    await s._setupForTest()
  })

  afterEach(async () => {
    await s._teardownForTest()
  })

  it('extended domain inherits parent vocabulary and adds new items', async () => {
    await s.domain.defineDomain({
      name: 'Base',
      actions: ['doA'],
      queries: [],
      assertions: ['checkA'],
    })

    await s.domain.extendDomain({
      assertions: ['checkB'],
    })

    await s.domain.hasVocabulary({
      actions: ['doA'],
      queries: [],
      assertions: ['checkA', 'checkB'],
    })
  })

  it('extended domain tracks its parent', async () => {
    await s.domain.defineDomain({
      name: 'ParentDomain',
      actions: [],
      queries: [],
      assertions: [],
    })

    await s.domain.extendDomain({
      assertions: ['extra'],
    })

    await s.domain.hasParent({ name: 'ParentDomain' })
  })

  it('extended domain can be implemented and used in a suite', async () => {
    await s.domain.defineDomain({
      name: 'ExtImpl',
      actions: ['create'],
      queries: [],
      assertions: ['exists'],
    })

    await s.domain.extendDomain({
      assertions: ['isVisible'],
    })

    await s.domain.implementDomain()
    await s.domain.registerAdapter()
    await s.domain.createSuite()

    await s.domain.executeAction({ name: 'create' })
    await s.domain.executeAssertion({ name: 'exists' })
    await s.domain.executeAssertion({ name: 'isVisible' })

    await s.domain.traceHasLength({ length: 3 })
  })
})
