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

  test('captures actions, queries, and assertions', async ({ given, then }) => {
    await given.defineDomain({
      name: 'TestDomain',
      actions: ['doA', 'doB'],
      queries: [{ name: 'getX', returnType: 'number' }],
      assertions: ['checkY'],
    })

    await then.hasVocabulary({
      actions: ['doA', 'doB'],
      queries: ['getX'],
      assertions: ['checkY'],
    })
  })

  test('allows empty vocabulary', async ({ given, then }) => {
    await given.defineDomain({
      name: 'Empty',
      actions: [],
      queries: [],
      assertions: [],
    })

    await then.hasVocabulary({
      actions: [],
      queries: [],
      assertions: [],
    })
  })
})
