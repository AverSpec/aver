import { describe } from 'vitest'
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
})
