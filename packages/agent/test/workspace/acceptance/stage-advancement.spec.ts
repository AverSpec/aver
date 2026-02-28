import { describe } from 'vitest'
import { suite } from '@aver/core'
import { stageAdvancement } from './domains/stage-advancement'
import { stageAdvancementAdapter } from './adapters/stage-advancement.unit'

describe('Stage Advancement', () => {
  const { test } = suite(stageAdvancement, stageAdvancementAdapter)

  // --- Pipeline Progression (cfab9c40) ---

  describe('pipeline progression', () => {
    test('captured advances to characterized', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'new behavior' })
      await when.advanceScenario({ rationale: 'investigated', promotedBy: 'dev' })
      await then.scenarioIsAt({ stage: 'characterized' })
      await then.advancementSucceeded({ to: 'characterized' })
      await then.transitionRecorded({ from: 'captured', to: 'characterized', by: 'dev' })
    })

    test('characterized with confirmation advances to mapped', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'confirmed behavior' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.confirmScenario({ confirmer: 'product-owner' })
      await when.advanceScenario({ rationale: 'confirmed by stakeholder', promotedBy: 'analyst' })
      await then.scenarioIsAt({ stage: 'mapped' })
      await then.advancementSucceeded({ to: 'mapped' })
    })

    test('mapped advances to specified', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'mapped behavior' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.confirmScenario({ confirmer: 'user' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await when.advanceScenario({ rationale: 'examples written', promotedBy: 'tester' })
      await then.scenarioIsAt({ stage: 'specified' })
      await then.advancementSucceeded({ to: 'specified' })
    })

    test('specified with domain link advances to implemented', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'specified behavior' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.confirmScenario({ confirmer: 'user' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.linkToDomain({ domainOperation: 'Cart.addItem' })
      await when.advanceScenario({ rationale: 'tests pass', promotedBy: 'dev' })
      await then.scenarioIsAt({ stage: 'implemented' })
      await then.advancementSucceeded({ to: 'implemented' })
    })

    test('implemented is terminal — advancement refused', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'terminal behavior' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.confirmScenario({ confirmer: 'user' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.linkToDomain({ domainOperation: 'Test.op' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await when.advanceScenario({ rationale: 'one more', promotedBy: 'dev' })
      await then.advancementBlocked({ reason: 'Cannot advance beyond implemented' })
    })

    test('characterized without confirmation stays at characterized', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'unconfirmed behavior' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await when.advanceScenario({ rationale: 'trying anyway', promotedBy: 'dev' })
      await then.advancementBlocked({ reason: 'confirmedBy is required' })
      await then.scenarioIsAt({ stage: 'characterized' })
    })
  })

  // --- Human Confirmation Gate (65509e46) ---

  describe('human confirmation gate', () => {
    test('agent cannot advance without human confirmation', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'needs human gate' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await when.advanceScenario({ rationale: 'skipping confirmation', promotedBy: 'agent' })
      await then.advancementBlocked({ reason: 'confirmedBy is required' })
      await then.scenarioIsAt({ stage: 'characterized' })
    })

    test('product owner confirms and scenario advances to mapped', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'awaiting confirmation' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.confirmScenario({ confirmer: 'product-owner' })
      await when.advanceScenario({ rationale: 'stakeholder approved', promotedBy: 'analyst' })
      await then.advancementSucceeded({ to: 'mapped' })
      await then.scenarioIsAt({ stage: 'mapped' })
    })

    test('revisit to captured clears confirmation', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'will be revisited' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.confirmScenario({ confirmer: 'product-owner' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      // Now at mapped. Revisit to captured should clear confirmation.
      await when.revisitScenario({ targetStage: 'captured', rationale: 'requirements changed' })
      await then.scenarioIsAt({ stage: 'captured' })
      await then.confirmationCleared()
    })
  })

  // --- Open Questions Gate (7927f5a7) ---

  describe('open questions gate', () => {
    test('unanswered question blocks mapped to specified', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'has open question' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.confirmScenario({ confirmer: 'user' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      // Now at mapped. Add a question.
      await given.addQuestion({ text: 'What about edge cases?' })
      await when.advanceScenario({ rationale: 'trying to advance', promotedBy: 'dev' })
      await then.advancementBlocked({ reason: 'open question' })
      await then.scenarioIsAt({ stage: 'mapped' })
    })

    test('all questions resolved allows advancement', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'questions resolved' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.confirmScenario({ confirmer: 'user' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.addQuestion({ text: 'How many retries?' })
      await given.resolveQuestion({ answer: 'Three retries' })
      await when.advanceScenario({ rationale: 'questions answered', promotedBy: 'dev' })
      await then.advancementSucceeded({ to: 'specified' })
      await then.scenarioIsAt({ stage: 'specified' })
    })

    test('no questions allows advancement freely', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'no questions at all' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.confirmScenario({ confirmer: 'user' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await when.advanceScenario({ rationale: 'clean advance', promotedBy: 'dev' })
      await then.advancementSucceeded({ to: 'specified' })
    })
  })

  // --- Domain Linking Gate (212ed8a4) ---

  describe('domain linking gate', () => {
    test('no domain link blocks specified to implemented', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'no links yet' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.confirmScenario({ confirmer: 'user' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      // Now at specified, no domain link
      await when.advanceScenario({ rationale: 'trying without link', promotedBy: 'dev' })
      await then.advancementBlocked({ reason: 'no domain links' })
      await then.scenarioIsAt({ stage: 'specified' })
    })

    test('linked via domainOperation allows advancement', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'linked by operation' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.confirmScenario({ confirmer: 'user' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.linkToDomain({ domainOperation: 'Cart.addItem' })
      await when.advanceScenario({ rationale: 'domain operation linked', promotedBy: 'dev' })
      await then.advancementSucceeded({ to: 'implemented' })
    })

    test('linked via testNames allows advancement', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'linked by tests' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.confirmScenario({ confirmer: 'user' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await given.linkToDomain({ testNames: ['adds item to cart', 'removes item'] })
      await when.advanceScenario({ rationale: 'tests linked', promotedBy: 'dev' })
      await then.advancementSucceeded({ to: 'implemented' })
    })

    test('linking is additive across fields', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'additive linking' })
      await given.linkToDomain({ domainOperation: 'Cart.addItem' })
      await when.linkToDomain({ testNames: ['test one'] })
      await then.domainLinksAre({ domainOperation: 'Cart.addItem', testNames: ['test one'] })
    })

    test('linking non-existent scenario fails', async ({ when, then }) => {
      // No scenario captured — session.scenarioId is empty
      await when.linkToDomain({ domainOperation: 'Ghost.op' })
      await then.operationFailed({ message: 'Scenario not found' })
    })
  })

  // --- Human Gates operations (5778f1ff) ---

  describe('human gates operations', () => {
    test('confirm sets confirmedBy field', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'awaiting confirm' })
      await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
      await when.confirmScenario({ confirmer: 'product-owner' })
      await then.confirmationIs({ confirmer: 'product-owner' })
    })

    test('re-confirm overwrites previous confirmer', async ({ given, when, then }) => {
      await given.captureScenario({ behavior: 'double confirm' })
      await given.confirmScenario({ confirmer: 'first-person' })
      await when.confirmScenario({ confirmer: 'second-person' })
      await then.confirmationIs({ confirmer: 'second-person' })
    })

    test('confirming non-existent scenario fails', async ({ when, then }) => {
      // No scenario captured — session.scenarioId is empty
      await when.confirmScenario({ confirmer: 'ghost' })
      await then.operationFailed({ message: 'Scenario not found' })
    })
  })
})
