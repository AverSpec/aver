import { describe, it, beforeEach, afterEach } from 'vitest'
import { suite } from '../../src/index'
import { _resetRegistry, _registerAdapter } from '../../src/core/registry'
import { averCore } from './domains/aver-core'
import { averCoreAdapter } from './adapters/aver-core.direct'

describe('Domain vocabulary', () => {
  const s = suite(averCore)

  beforeEach(async () => {
    _resetRegistry()
    _registerAdapter(averCoreAdapter)
    await s._setupForTest()
  })

  afterEach(async () => {
    await s._teardownForTest()
  })

  it('captures actions, queries, and assertions', async () => {
    await s.domain.defineDomain({
      name: 'TestDomain',
      actions: ['doA', 'doB'],
      queries: [{ name: 'getX', returnType: 'number' }],
      assertions: ['checkY'],
    })

    await s.domain.hasVocabulary({
      actions: ['doA', 'doB'],
      queries: ['getX'],
      assertions: ['checkY'],
    })
  })

  it('allows empty vocabulary', async () => {
    await s.domain.defineDomain({
      name: 'Empty',
      actions: [],
      queries: [],
      assertions: [],
    })

    await s.domain.hasVocabulary({
      actions: [],
      queries: [],
      assertions: [],
    })
  })
})
