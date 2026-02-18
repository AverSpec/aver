import { describe } from 'vitest'
import { suite } from '@aver/core'
import { averWorkspace } from './domains/aver-workspace'
import { averWorkspaceAdapter } from './adapters/aver-workspace.unit'

describe('Scenario Pipeline', () => {
  const { test } = suite(averWorkspace, averWorkspaceAdapter)

  // --- Lifecycle ---

  describe('lifecycle', () => {
    test('captures a scenario at the captured stage', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'user logs in' })
      const id = await query.lastCapturedId()
      await assert.scenarioHasStage({ id, stage: 'captured' })
    })

    test('defaults mode to observed', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'user logs in' })
      const id = await query.lastCapturedId()
      await assert.scenarioHasMode({ id, mode: 'observed' })
    })

    test('captures with intended mode', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'user logs in', mode: 'intended' })
      const id = await query.lastCapturedId()
      await assert.scenarioHasMode({ id, mode: 'intended' })
    })

    test('advances through all five stages', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'full lifecycle' })
      const id = await query.lastCapturedId()

      await act.advanceScenario({ id, rationale: 'investigated', promotedBy: 'dev' })
      await assert.scenarioHasStage({ id, stage: 'characterized' })
      await assert.scenarioHasPromotedFrom({ id, stage: 'captured' })

      await act.advanceScenario({ id, rationale: 'confirmed', promotedBy: 'business' })
      await assert.scenarioHasStage({ id, stage: 'mapped' })

      await act.advanceScenario({ id, rationale: 'examples written', promotedBy: 'testing' })
      await assert.scenarioHasStage({ id, stage: 'specified' })

      await act.advanceScenario({ id, rationale: 'tests pass', promotedBy: 'dev' })
      await assert.scenarioHasStage({ id, stage: 'implemented' })
    })

    test('cannot advance beyond implemented', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'at the ceiling' })
      const id = await query.lastCapturedId()
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      // now at implemented — one more should error
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await assert.throwsError({ message: 'Cannot advance beyond implemented' })
    })

    test('regresses to an earlier stage', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'regress test' })
      const id = await query.lastCapturedId()
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await assert.scenarioHasStage({ id, stage: 'mapped' })

      await act.regressScenario({ id, targetStage: 'captured', rationale: 'requirements changed' })
      await assert.scenarioHasStage({ id, stage: 'captured' })
      await assert.scenarioHasRegressionRationale({ id, rationale: 'requirements changed' })
      await assert.scenarioHasPromotedFrom({ id, stage: 'mapped' })
    })

    test('cannot regress to a later stage', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'bad regress' })
      const id = await query.lastCapturedId()
      await act.regressScenario({ id, targetStage: 'mapped', rationale: 'nope' })
      await assert.throwsError({ message: 'Cannot regress to a later stage' })
    })

    test('throws on advance with unknown id', async ({ act, assert }) => {
      await act.advanceScenario({ id: 'nonexist', rationale: 'r', promotedBy: 'p' })
      await assert.throwsError({ message: 'Scenario not found' })
    })

    test('deletes a scenario by id', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'to be deleted' })
      const id = await query.lastCapturedId()
      await assert.scenarioHasStage({ id, stage: 'captured' })
      await act.deleteScenario({ id })
      await assert.scenarioDoesNotExist({ id })
    })

    test('throws on delete with unknown id', async ({ act, assert }) => {
      await act.deleteScenario({ id: 'nonexist' })
      await assert.throwsError({ message: 'Scenario not found' })
    })

    test('throws on regress with unknown id', async ({ act, assert }) => {
      await act.regressScenario({ id: 'nonexist', targetStage: 'captured', rationale: 'r' })
      await assert.throwsError({ message: 'Scenario not found' })
    })

    test('throws on addQuestion with unknown scenario id', async ({ act, assert }) => {
      await act.addQuestion({ scenarioId: 'nonexist', text: 'question' })
      await assert.throwsError({ message: 'Scenario not found' })
    })

    test('throws on resolveQuestion with unknown scenario id', async ({ act, assert }) => {
      await act.resolveQuestion({ scenarioId: 'nonexist', questionId: 'qid', answer: 'answer' })
      await assert.throwsError({ message: 'Scenario not found' })
    })
  })

  // --- Questions ---

  describe('questions', () => {
    test('adds an open question to a scenario', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'needs clarification' })
      const id = await query.lastCapturedId()
      await act.addQuestion({ scenarioId: id, text: 'What happens on timeout?' })
      await assert.hasOpenQuestion({ id, text: 'What happens on timeout?' })
      await assert.openQuestionCountIs({ count: 1 })
    })

    test('resolving a question clears it from open questions', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'question lifecycle' })
      const scenarioId = await query.lastCapturedId()
      await act.addQuestion({ scenarioId, text: 'How many retries?' })
      const qId = await query.lastQuestionId()

      await act.resolveQuestion({ scenarioId, questionId: qId, answer: 'Three retries' })
      await assert.questionIsResolved({ scenarioId, questionId: qId })
      await assert.openQuestionCountIs({ count: 0 })
    })

    test('scenario with open question is excluded from advance candidates', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'blocked by question' })
      const id = await query.lastCapturedId()
      await act.addQuestion({ scenarioId: id, text: 'Unresolved' })
      await assert.advanceCandidateCountIs({ count: 0 })
    })

    test('resolving question makes scenario an advance candidate again', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'unblocked' })
      const id = await query.lastCapturedId()
      await act.addQuestion({ scenarioId: id, text: 'Blocking question' })
      const qId = await query.lastQuestionId()
      await assert.advanceCandidateCountIs({ count: 0 })

      await act.resolveQuestion({ scenarioId: id, questionId: qId, answer: 'Answered' })
      await assert.advanceCandidateCountIs({ count: 1 })
    })
  })

  // --- Phase detection ---

  describe('phase detection', () => {
    test('empty workspace is in kickoff phase', async ({ assert }) => {
      await assert.workflowPhaseIs({ phase: 'kickoff' })
    })

    test('captured scenarios trigger investigation phase', async ({ act, assert }) => {
      await act.captureScenario({ behavior: 'something observed' })
      await assert.workflowPhaseIs({ phase: 'investigation' })
    })

    test('characterized scenario triggers mapping phase', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'investigated' })
      const id = await query.lastCapturedId()
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await assert.workflowPhaseIs({ phase: 'mapping' })
    })

    test('mapped scenario triggers specification phase', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'confirmed' })
      const id = await query.lastCapturedId()
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await assert.workflowPhaseIs({ phase: 'specification' })
    })

    test('specified scenario triggers implementation phase', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'specified' })
      const id = await query.lastCapturedId()
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await assert.workflowPhaseIs({ phase: 'implementation' })
    })

    test('all implemented with domain links triggers verification phase', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'complete' })
      const id = await query.lastCapturedId()
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await act.linkToDomain({ scenarioId: id, domainOperation: 'MyDomain.myAction' })
      await assert.workflowPhaseIs({ phase: 'verification' })
    })

    test('implemented without domain link stays in implementation phase', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'no link yet' })
      const id = await query.lastCapturedId()
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await assert.workflowPhaseIs({ phase: 'implementation' })
    })

    test('mixed captured and implemented stays in implementation phase', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'fully done' })
      const id1 = await query.lastCapturedId()
      await act.advanceScenario({ id: id1, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id: id1, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id: id1, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id: id1, rationale: 'r', promotedBy: 'p' })
      await act.linkToDomain({ scenarioId: id1, domainOperation: 'Test.action' })

      await act.captureScenario({ behavior: 'still captured' })
      // One implemented with link + one captured → should be investigation (captured takes priority)
      await assert.workflowPhaseIs({ phase: 'investigation' })
    })
  })

  // --- Domain linking ---

  describe('domain linking', () => {
    test('links a domain operation to a scenario', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'linkable' })
      const id = await query.lastCapturedId()
      await act.linkToDomain({ scenarioId: id, domainOperation: 'Cart.addItem' })
      await assert.scenarioHasDomainOperation({ id, operation: 'Cart.addItem' })
    })

    test('links test names to a scenario', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'with tests' })
      const id = await query.lastCapturedId()
      await act.linkToDomain({ scenarioId: id, testNames: ['adds item to cart', 'removes item'] })
      await assert.scenarioHasTestNames({ id, names: ['adds item to cart', 'removes item'] })
    })

    test('linking is additive across calls', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'additive linking' })
      const id = await query.lastCapturedId()
      await act.linkToDomain({ scenarioId: id, domainOperation: 'Cart.addItem' })
      await act.linkToDomain({ scenarioId: id, testNames: ['test one'] })
      await assert.scenarioHasDomainOperation({ id, operation: 'Cart.addItem' })
      await assert.scenarioHasTestNames({ id, names: ['test one'] })
    })
  })

  // --- Export / Import ---

  describe('export and import', () => {
    test('markdown export includes scenario behavior and stage grouping', async ({ act, assert }) => {
      await act.captureScenario({ behavior: 'login with password', story: 'Authentication' })
      await assert.markdownContains({ text: 'login with password' })
      await assert.markdownContains({ text: 'Captured' })
    })

    test('markdown export shows open questions', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'needs answer' })
      const id = await query.lastCapturedId()
      await act.addQuestion({ scenarioId: id, text: 'What about edge cases?' })
      await assert.markdownContains({ text: 'What about edge cases?' })
    })

    test('JSON export round-trips through import', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'exportable scenario' })
      const json = await query.exportedJson()
      // Import into same store — should skip the duplicate
      await act.importScenarios({ json })
      await assert.importResultIs({ added: 0, skipped: 1 })
    })

    test('import adds new scenarios and skips duplicates', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'original scenario' })
      const json = await query.exportedJson()

      // Modify the JSON to include a new scenario alongside the original
      const workspace = JSON.parse(json)
      const newScenario = { ...workspace.scenarios[0], id: 'newid123', behavior: 'new scenario' }
      workspace.scenarios.push(newScenario)
      const modifiedJson = JSON.stringify(workspace)

      await act.importScenarios({ json: modifiedJson })
      await assert.importResultIs({ added: 1, skipped: 1 })
      await assert.summaryCountIs({ stage: 'captured', count: 2 })
    })
  })

  // --- Persistence ---

  describe('persistence', () => {
    test('scenarios survive save and reload from disk', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'persisted behavior' })
      const id = await query.lastCapturedId()

      await act.reloadFromDisk()

      const count = await query.scenarioCount()
      expect(count).toBe(1)
      await assert.scenarioSurvivedRoundTrip({ id, behavior: 'persisted behavior' })
    })

    test('multiple scenarios persist across reload', async ({ act, query }) => {
      await act.captureScenario({ behavior: 'first' })
      await act.captureScenario({ behavior: 'second' })
      await act.captureScenario({ behavior: 'third' })

      await act.reloadFromDisk()

      const count = await query.scenarioCount()
      expect(count).toBe(3)
    })
  })

  // --- Summary queries ---

  describe('summary', () => {
    test('summary counts scenarios by stage', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'first' })
      await act.captureScenario({ behavior: 'second' })
      const id = await query.lastCapturedId()
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })

      await assert.summaryCountIs({ stage: 'captured', count: 1 })
      await assert.summaryCountIs({ stage: 'characterized', count: 1 })
    })

    test('filtering scenarios by stage', async ({ act, query }) => {
      await act.captureScenario({ behavior: 'one' })
      await act.captureScenario({ behavior: 'two' })
      const id = await query.lastCapturedId()
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })

      const captured = await query.scenarios({ stage: 'captured' })
      const characterized = await query.scenarios({ stage: 'characterized' })
      if (captured.length !== 1) throw new Error(`Expected 1 captured, got ${captured.length}`)
      if (characterized.length !== 1) throw new Error(`Expected 1 characterized, got ${characterized.length}`)
    })

    test('filtering scenarios by keyword', async ({ act, query }) => {
      await act.captureScenario({ behavior: 'user login flow' })
      await act.captureScenario({ behavior: 'cart checkout' })

      const results = await query.scenarios({ keyword: 'login' })
      if (results.length !== 1) throw new Error(`Expected 1 result, got ${results.length}`)
      if (results[0].behavior !== 'user login flow')
        throw new Error(`Expected "user login flow" but got "${results[0].behavior}"`)
    })

    test('implemented scenarios are excluded from advance candidates', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'fully done' })
      const id = await query.lastCapturedId()
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await assert.scenarioHasStage({ id, stage: 'implemented' })
      await assert.advanceCandidateCountIs({ count: 0 })
    })

    test('keyword filter matches context field', async ({ act, query }) => {
      await act.captureScenario({ behavior: 'user clicks button', context: 'checkout page' })
      await act.captureScenario({ behavior: 'user logs in' })

      const results = await query.scenarios({ keyword: 'checkout' })
      if (results.length !== 1) throw new Error(`Expected 1 result, got ${results.length}`)
      if (results[0].behavior !== 'user clicks button')
        throw new Error(`Expected "user clicks button" but got "${results[0].behavior}"`)
    })

    test('story filter matches exact story', async ({ act, query }) => {
      await act.captureScenario({ behavior: 'behavior one', story: 'Auth' })
      await act.captureScenario({ behavior: 'behavior two', story: 'Cart' })

      const results = await query.scenarios({ story: 'Auth' })
      if (results.length !== 1) throw new Error(`Expected 1 result, got ${results.length}`)
      if (results[0].behavior !== 'behavior one')
        throw new Error(`Expected "behavior one" but got "${results[0].behavior}"`)
    })

    test('mapped scenario without questions is an advance candidate', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'at mapped' })
      const id = await query.lastCapturedId()
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await assert.scenarioHasStage({ id, stage: 'mapped' })
      await assert.advanceCandidateCountIs({ count: 1 })
    })

    test('specified scenario without questions is an advance candidate', async ({ act, assert, query }) => {
      await act.captureScenario({ behavior: 'at specified' })
      const id = await query.lastCapturedId()
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await act.advanceScenario({ id, rationale: 'r', promotedBy: 'p' })
      await assert.scenarioHasStage({ id, stage: 'specified' })
      await assert.advanceCandidateCountIs({ count: 1 })
    })
  })
})
