import { describe } from 'vitest'
import { suite } from '@aver/core'
import { workspacePersistence } from './domains/workspace-persistence'
import { workspacePersistenceAdapter } from './adapters/workspace-persistence.unit'

describe('Workspace Persistence', () => {
  const { test } = suite(workspacePersistence, workspacePersistenceAdapter)

  test('single scenario survives reload', async ({ given, when, then }) => {
    await given.captureScenario({ behavior: 'persisted behavior' })
    await when.reloadFromDisk()
    await then.scenarioCountIs({ count: 1 })
    await then.scenarioSurvivedReload({ behavior: 'persisted behavior' })
  })

  test('multiple scenarios survive reload', async ({ given, when, then }) => {
    await given.captureScenario({ behavior: 'first' })
    await given.captureScenario({ behavior: 'second' })
    await given.captureScenario({ behavior: 'third' })
    await when.reloadFromDisk()
    await then.scenarioCountIs({ count: 3 })
  })
})
