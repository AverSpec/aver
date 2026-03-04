import { describe } from 'vitest'
import { suite } from '@aver/core'
import { batchOperations } from './domains/batch-operations'
import { batchOperationsAdapter } from './adapters/batch-operations.unit'

describe('Batch Operations', () => {
  const { test } = suite(batchOperations, batchOperationsAdapter)

  // --- Batch Advance (d2ab02a5) ---

  describe('batch advance', () => {
    test('advances all eligible scenarios', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'first' })
      await given.captureScenario({ behavior: 'second' })
      await given.captureScenario({ behavior: 'third' })
      await when.batchAdvance({ rationale: 'ready', promotedBy: 'tester' })
      await then.advanceSummaryIs({ advanced: 3, blocked: 0, errors: 0 })
      await then.scenarioAtStage({ index: 0, stage: 'characterized' })
      await then.scenarioAtStage({ index: 1, stage: 'characterized' })
      await then.scenarioAtStage({ index: 2, stage: 'characterized' })
    })

    test('partial success — eligible and blocked', async ({ given, when, then }) => {
      // Set up: 3 scenarios at characterized, only 2 confirmed
      await given.captureScenario({ behavior: 'confirmed one' })
      await given.captureScenario({ behavior: 'confirmed two' })
      await given.captureScenario({ behavior: 'not confirmed' })
      // Advance all to characterized
      await given.batchAdvance({ rationale: 'setup', promotedBy: 'tester' })
      // Confirm only first two — third will be blocked at characterized → mapped
      await given.confirmScenario({ index: 0, confirmer: 'owner' })
      await given.confirmScenario({ index: 1, confirmer: 'owner' })
      await when.batchAdvance({ rationale: 'batch', promotedBy: 'tester' })
      await then.advanceSummaryIs({ advanced: 2, blocked: 1, errors: 0 })
      await then.resultStatus({ index: 0, status: 'advanced' })
      await then.resultStatus({ index: 1, status: 'advanced' })
      await then.resultStatus({ index: 2, status: 'blocked' })
      await then.scenarioAtStage({ index: 0, stage: 'mapped' })
      await then.scenarioAtStage({ index: 2, stage: 'characterized' })
    })

    test('non-existent ID reports error, real IDs still advance', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'real scenario' })
      await given.injectFakeId({ id: '00000000-0000-0000-0000-000000000000' })
      await given.captureScenario({ behavior: 'also real' })
      await when.batchAdvance({ rationale: 'test', promotedBy: 'tester' })
      await then.resultStatus({ index: 0, status: 'advanced' })
      await then.resultStatus({ index: 1, status: 'error' })
      await then.resultStatus({ index: 2, status: 'advanced' })
      await then.advanceSummaryIs({ advanced: 2, blocked: 0, errors: 1 })
      await then.scenarioAtStage({ index: 0, stage: 'characterized' })
      await then.scenarioAtStage({ index: 2, stage: 'characterized' })
    })
  })

  // --- Batch Revisit (8092ab7f) ---

  describe('batch revisit', () => {
    test('revisits all eligible scenarios', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'first' })
      await given.captureScenario({ behavior: 'second' })
      await given.captureScenario({ behavior: 'third' })
      // Advance all to characterized
      await given.batchAdvance({ rationale: 'setup', promotedBy: 'tester' })
      await when.batchRevisit({ targetStage: 'captured', rationale: 'rethink' })
      await then.revisitSummaryIs({ revisited: 3, errors: 0 })
      await then.scenarioAtStage({ index: 0, stage: 'captured' })
      await then.scenarioAtStage({ index: 1, stage: 'captured' })
      await then.scenarioAtStage({ index: 2, stage: 'captured' })
    })

    test('partial success — mixed stages with same-stage error', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'stays captured' })
      await given.captureScenario({ behavior: 'will advance' })
      // Advance only second scenario to characterized
      await given.advanceSingle({ index: 1, rationale: 'setup', promotedBy: 'tester' })
      // Revisit both to captured — first is already at captured (error), second succeeds
      await when.batchRevisit({ targetStage: 'captured', rationale: 'redo' })
      await then.resultStatus({ index: 0, status: 'error' })
      await then.resultStatus({ index: 1, status: 'revisited' })
      await then.revisitSummaryIs({ revisited: 1, errors: 1 })
    })

    test('non-existent ID reports error, real IDs still revisit', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'real one' })
      await given.captureScenario({ behavior: 'real two' })
      // Advance both individually to characterized so they can be revisited
      // (advanceSingle does not set advanceResult, keeping resultStatus unambiguous)
      await given.advanceSingle({ index: 0, rationale: 'setup', promotedBy: 'tester' })
      await given.advanceSingle({ index: 1, rationale: 'setup', promotedBy: 'tester' })
      // Inject fake ID after the two real IDs
      await given.injectFakeId({ id: '00000000-0000-0000-0000-000000000001' })
      await when.batchRevisit({ targetStage: 'captured', rationale: 'redo' })
      await then.resultStatus({ index: 0, status: 'revisited' })
      await then.resultStatus({ index: 1, status: 'revisited' })
      await then.resultStatus({ index: 2, status: 'error' })
      await then.revisitSummaryIs({ revisited: 2, errors: 1 })
      await then.scenarioAtStage({ index: 0, stage: 'captured' })
      await then.scenarioAtStage({ index: 1, stage: 'captured' })
    })
  })
})
