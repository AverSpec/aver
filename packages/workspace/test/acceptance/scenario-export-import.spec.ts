import { describe } from 'vitest'
import { suite } from '@aver/core'
import { scenarioExportImport } from './domains/scenario-export-import'
import { scenarioExportImportAdapter } from './adapters/scenario-export-import.unit'

describe('Scenario Export/Import', () => {
  const { test } = suite(scenarioExportImport, scenarioExportImportAdapter)

  test('markdown export includes behavior and stage heading', async ({ when, then }) => {
    await when.captureScenario({ behavior: 'login with password', story: 'Authentication' })
    await then.markdownContains({ text: 'login with password' })
    await then.markdownContains({ text: 'Captured' })
  })

  test('markdown export shows open questions', async ({ given, when, then }) => {
    await given.captureScenario({ behavior: 'needs answer' })
    await when.addQuestion({ text: 'What about edge cases?' })
    await then.markdownContains({ text: 'What about edge cases?' })
  })

  test('JSON round-trip preserves scenario data', async ({ given, when, then, query }) => {
    await given.captureScenario({ behavior: 'exportable scenario' })
    const json = await query.exportedJson()
    // Import into same store — should skip the duplicate
    await when.importScenarios({ json })
    await then.importResultIs({ added: 0, skipped: 1 })
  })

  test('import skips duplicates with counts', async ({ given, when, then, query }) => {
    await given.captureScenario({ behavior: 'original scenario' })
    const json = await query.exportedJson()

    // Modify the JSON to include a new scenario alongside the original
    const workspace = JSON.parse(json)
    const newScenario = { ...workspace.scenarios[0], id: 'newid123', behavior: 'new scenario' }
    workspace.scenarios.push(newScenario)
    const modifiedJson = JSON.stringify(workspace)

    await when.importScenarios({ json: modifiedJson })
    await then.importResultIs({ added: 1, skipped: 1 })
    await then.stageCountIs({ stage: 'captured', count: 2 })
  })
})
