import { describe } from 'vitest'
import { suite } from '@aver/core'
import { scenarioLifecycle } from './domains/scenario-lifecycle'
import { scenarioLifecycleAdapter } from './adapters/scenario-lifecycle.unit'

describe('Scenario Lifecycle', () => {
  const { test } = suite(scenarioLifecycle, scenarioLifecycleAdapter)

  // --- Scenario Capture (98bbea9e) ---

  describe('capture', () => {
    test('creates scenario at captured stage with empty collections', async ({ when, then }) => {
      await when.captureScenario({ behavior: 'user logs in' })
      await then.scenarioCreated()
      await then.behaviorIs({ behavior: 'user logs in' })
    })

    test('captures with optional context and story', async ({ when, then, query }) => {
      await when.captureScenario({
        behavior: 'user clicks button',
        context: 'checkout page',
        story: 'Authentication',
      })
      await then.scenarioCreated()
      await then.behaviorIs({ behavior: 'user clicks button' })
    })

    test('multiple captures create independent scenarios', async ({ when, query }) => {
      await when.captureScenario({ behavior: 'first behavior' })
      const stage1 = await query.scenarioStage()
      await when.captureScenario({ behavior: 'second behavior' })
      const stage2 = await query.scenarioStage()
      // Both should be captured (second capture replaces session.scenarioId)
      if (stage1 !== 'captured') throw new Error(`First: expected captured, got ${stage1}`)
      if (stage2 !== 'captured') throw new Error(`Second: expected captured, got ${stage2}`)
    })
  })

  // --- Mode Defaulting (73c8371b) ---

  describe('mode defaulting', () => {
    test('defaults to observed when no mode specified', async ({ when, then }) => {
      await when.captureScenario({ behavior: 'no mode given' })
      await then.modeIs({ mode: 'observed' })
    })

    test('explicit intended mode overrides default', async ({ when, then }) => {
      await when.captureScenario({ behavior: 'stakeholder request', mode: 'intended' })
      await then.modeIs({ mode: 'intended' })
    })

    test('explicit observed mode matches default', async ({ when, then }) => {
      await when.captureScenario({ behavior: 'code observation', mode: 'observed' })
      await then.modeIs({ mode: 'observed' })
    })
  })

  // --- Scenario Update (e762bdbf) ---

  describe('update', () => {
    test('updates behavior without changing stage', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'original wording' })
      await when.updateScenario({ behavior: 'refined wording' })
      await then.behaviorIs({ behavior: 'refined wording' })
      await then.stageUnchanged({ stage: 'captured' })
    })

    test('replaces rules array', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'needs rules' })
      await when.updateScenario({ rules: ['rule one', 'rule two'] })
      await then.rulesReplaced({ count: 2 })
      await then.stageUnchanged({ stage: 'captured' })
    })

    test('unknown scenario ID fails', async ({ when, then }) => {
      // session.scenarioId is empty string — no scenario created
      await when.updateScenario({ behavior: 'ghost' })
      await then.operationFailed({ message: 'Scenario not found' })
    })
  })

  // --- Deletion ---

  describe('deletion', () => {
    test('deletes a scenario by ID', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'to be deleted' })
      await then.stageIs({ stage: 'captured' })
      await when.deleteScenario()
      await then.scenarioDoesNotExist()
    })

    test('delete with unknown ID fails', async ({ when, then }) => {
      // session.scenarioId is empty string — no scenario created
      await when.deleteScenario()
      await then.operationFailed({ message: 'Scenario not found' })
    })

    test('delete removes scenario from workspace', async ({ given, when, then, query }) => {
      await given.captureScenario({ behavior: 'will be removed' })
      await then.stageIs({ stage: 'captured' })
      await when.deleteScenario()
      const stage = await query.scenarioStage()
      if (stage !== 'unknown') throw new Error(`Expected unknown, got ${stage}`)
    })
  })

  // --- Stage Revisit (cd463cbb) ---

  describe('revisit', () => {
    test('revisit to captured clears confirmation and domain links', async ({
      given,
      when,
      then,
    }) => {
      await given.captureScenario({ behavior: 'will revisit' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.confirmScenario({ confirmer: 'product-owner' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.linkToDomain({ domainOperation: 'Test.op' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      // Now at implemented. Revisit to captured.
      await when.revisitScenario({ targetStage: 'captured', rationale: 'requirements changed' })
      await then.stageIs({ stage: 'captured' })
      await then.confirmationCleared()
      await then.linksCleared()
      await then.transitionRecorded({ from: 'implemented', to: 'captured' })
    })

    test('revisit to characterized preserves confirmation', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'partial revisit' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.confirmScenario({ confirmer: 'product-owner' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      // Now at specified. Revisit to characterized (index 1, NOT < 1).
      await when.revisitScenario({ targetStage: 'characterized', rationale: 'rethink examples' })
      await then.stageIs({ stage: 'characterized' })
      await then.confirmationPresent({ confirmer: 'product-owner' })
    })

    test('cannot revisit to later or same stage', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'bad revisit' })
      await when.revisitScenario({ targetStage: 'mapped', rationale: 'nope' })
      await then.operationFailed({ message: 'Cannot revisit to a later or same stage' })
    })

    test('revisit clears domain links when passing below specified', async ({
      given,
      when,
      then,
    }) => {
      await given.captureScenario({ behavior: 'linked scenario' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.confirmScenario({ confirmer: 'user' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.linkToDomain({ domainOperation: 'Cart.addItem' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      // Now at implemented with links. Revisit to mapped (index 2, < 3).
      await when.revisitScenario({ targetStage: 'mapped', rationale: 'redesign' })
      await then.stageIs({ stage: 'mapped' })
      await then.linksCleared()
      await then.confirmationPresent({ confirmer: 'user' })
    })
  })
})
