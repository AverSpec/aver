import { describe } from 'vitest'
import { suite } from '../../src/index'
import { resetRegistry } from '../../src/core/registry'
import { averCore } from './domains/aver-core'
import { averCoreAdapter } from './adapters/aver-core.unit'
import { beforeEach } from 'vitest'

describe('Domain vocabulary', () => {
  const { test } = suite(averCore, averCoreAdapter)

  beforeEach(() => {
    resetRegistry()
  })

  test('captures actions, queries, and assertions', async ({ act, assert }) => {
    await act.defineDomain({
      name: 'TestDomain',
      actions: ['doA', 'doB'],
      queries: [{ name: 'getX', returnType: 'number' }],
      assertions: ['checkY'],
    })

    await assert.hasVocabulary({
      actions: ['doA', 'doB'],
      queries: ['getX'],
      assertions: ['checkY'],
    })
  })

  test('allows empty vocabulary', async ({ act, assert }) => {
    await act.defineDomain({
      name: 'Empty',
      actions: [],
      queries: [],
      assertions: [],
    })

    await assert.hasVocabulary({
      actions: [],
      queries: [],
      assertions: [],
    })
  })
})
