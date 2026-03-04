import { describe, expect } from 'vitest'
import { suite } from '@aver/core'
import { scenarioQuerying } from './domains/scenario-querying'
import { scenarioQueryingAdapter } from './adapters/scenario-querying.unit'

describe('Scenario Querying', () => {
  const { test } = suite(scenarioQuerying, scenarioQueryingAdapter)

  test('summary counts scenarios by stage', async ({ given, when, then }) => {
    await given.captureScenario({ behavior: 'first' })
    await given.captureScenario({ behavior: 'second' })
    await when.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await then.stageCountIs({ stage: 'captured', count: 1 })
    await then.stageCountIs({ stage: 'characterized', count: 1 })
  })

  test('filter by stage returns matching', async ({ given, when, query }) => {
    await given.captureScenario({ behavior: 'one' })
    await given.captureScenario({ behavior: 'two' })
    await when.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    const captured = await query.scenariosByFilter({ stage: 'captured' })
    const characterized = await query.scenariosByFilter({ stage: 'characterized' })
    if (captured !== 1) throw new Error(`Expected 1 captured, got ${captured}`)
    if (characterized !== 1) throw new Error(`Expected 1 characterized, got ${characterized}`)
  })

  test('filter by keyword matches behavior', async ({ when, query, then }) => {
    await when.captureScenario({ behavior: 'user login flow' })
    await when.captureScenario({ behavior: 'cart checkout' })
    await query.scenariosByFilter({ keyword: 'login' })
    await then.filterReturns({ count: 1 })
  })

  test('filter by keyword matches context', async ({ when, query, then }) => {
    await when.captureScenario({ behavior: 'user clicks button', context: 'checkout page' })
    await when.captureScenario({ behavior: 'user logs in' })
    await query.scenariosByFilter({ keyword: 'checkout' })
    await then.filterReturns({ count: 1 })
  })

  test('filter by story matches exact story', async ({ when, query, then }) => {
    await when.captureScenario({ behavior: 'behavior one', story: 'Auth' })
    await when.captureScenario({ behavior: 'behavior two', story: 'Cart' })
    await query.scenariosByFilter({ story: 'Auth' })
    await then.filterReturns({ count: 1 })
  })

  test('implemented excluded from advance candidates', async ({ given, when, then }) => {
    await given.captureScenario({ behavior: 'fully done' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await given.confirmScenario({ confirmer: 'user' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await given.linkToDomain({ domainOperation: 'Test.op' })
    await when.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await then.advanceCandidatesAre({ count: 0 })
  })

  test('mapped without questions is advance candidate', async ({ given, when, then }) => {
    await given.captureScenario({ behavior: 'at mapped' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await given.confirmScenario({ confirmer: 'user' })
    await when.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await then.advanceCandidatesAre({ count: 1 })
  })

  test('specified without questions is advance candidate', async ({ given, when, then }) => {
    await given.captureScenario({ behavior: 'at specified' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await given.confirmScenario({ confirmer: 'user' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await when.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await then.advanceCandidatesAre({ count: 1 })
  })

  test('filter by mode returns only matching scenarios', async ({ when, query, then }) => {
    await when.captureScenario({ behavior: 'observed behavior', mode: 'observed' })
    await when.captureScenario({ behavior: 'intended behavior', mode: 'intended' })
    await query.scenariosByFilter({ mode: 'observed' })
    await then.filterReturns({ count: 1 })
    await query.scenariosByFilter({ mode: 'intended' })
    await then.filterReturns({ count: 1 })
  })

  test('filter by hasConfirmation returns confirmed scenarios', async ({ given, when, query, then }) => {
    await given.captureScenario({ behavior: 'unconfirmed' })
    await given.captureScenario({ behavior: 'confirmed' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await when.confirmScenario({ confirmer: 'product-owner' })
    await query.scenariosByFilter({ hasConfirmation: true })
    await then.filterReturns({ count: 1 })
    await query.scenariosByFilter({ hasConfirmation: false })
    await then.filterReturns({ count: 1 })
  })

  test('filter by domainOperation matches substring', async ({ given, when, query, then }) => {
    await given.captureScenario({ behavior: 'linked scenario' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await given.confirmScenario({ confirmer: 'user' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await given.linkToDomain({ domainOperation: 'Cart.addItem' })
    await given.captureScenario({ behavior: 'unlinked scenario' })
    await query.scenariosByFilter({ domainOperation: 'Cart' })
    await then.filterReturns({ count: 1 })
    await query.scenariosByFilter({ domainOperation: 'addItem' })
    await then.filterReturns({ count: 1 })
    await query.scenariosByFilter({ domainOperation: 'User' })
    await then.filterReturns({ count: 0 })
  })

  test('filter by hasOpenQuestions returns scenarios with unresolved questions', async ({ given, when, query, then }) => {
    await given.captureScenario({ behavior: 'no questions' })
    await given.captureScenario({ behavior: 'has open question' })
    await when.addQuestion({ text: 'What is the timeout?' })
    await query.scenariosByFilter({ hasOpenQuestions: true })
    await then.filterReturns({ count: 1 })
    await query.scenariosByFilter({ hasOpenQuestions: false })
    await then.filterReturns({ count: 1 })
  })

  test('filter by createdAfter excludes scenarios created before cutoff', async ({ when, query, then }) => {
    await when.captureScenario({ behavior: 'any scenario' })
    await query.scenariosByFilter({ createdAfter: '2020-01-01T00:00:00.000Z' })
    await then.filterReturns({ count: 1 })
    await query.scenariosByFilter({ createdAfter: '2099-12-31T00:00:00.000Z' })
    await then.filterReturns({ count: 0 })
  })

  test('filter by createdBefore excludes scenarios created after cutoff', async ({ when, query, then }) => {
    await when.captureScenario({ behavior: 'any scenario' })
    await query.scenariosByFilter({ createdBefore: '2099-12-31T00:00:00.000Z' })
    await then.filterReturns({ count: 1 })
    await query.scenariosByFilter({ createdBefore: '2020-01-01T00:00:00.000Z' })
    await then.filterReturns({ count: 0 })
  })

  test('summary reports open question count across all scenarios', async ({ given, when, query, then }) => {
    await given.captureScenario({ behavior: 'first' })
    await given.addQuestion({ text: 'First question?' })
    await given.captureScenario({ behavior: 'second' })
    await given.addQuestion({ text: 'Second question?' })
    await when.resolveQuestion({ answer: 'Resolved.' })
    const openCount = await query.summaryOpenQuestions()
    expect(openCount).toBe(1)
    await then.openQuestionsCountIs({ count: 1 })
  })

  test('field projection returns only requested fields', async ({ when, query, then }) => {
    await when.captureScenario({ behavior: 'projected scenario', story: 'Auth' })
    await query.scenariosByFilter({ fields: ['id', 'stage'] })
    await then.filterReturns({ count: 1 })
    await then.projectedKeysAre({ keys: 'id,stage' })
  })
})
