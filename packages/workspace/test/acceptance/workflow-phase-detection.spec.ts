import { describe } from 'vitest'
import { suite } from '@aver/core'
import { workflowPhaseDetection } from './domains/workflow-phase-detection'
import { workflowPhaseDetectionAdapter } from './adapters/workflow-phase-detection.unit'

describe('Workflow Phase Detection', () => {
  const { test } = suite(workflowPhaseDetection, workflowPhaseDetectionAdapter)

  test('empty workspace is in kickoff phase', async ({ then }) => {
    await then.phaseIs({ phase: 'kickoff' })
  })

  test('captured scenario triggers investigation phase', async ({ when, then }) => {
    await when.captureScenario({ behavior: 'something observed' })
    await then.phaseIs({ phase: 'investigation' })
  })

  test('characterized scenario triggers mapping phase', async ({ given, when, then }) => {
    await given.captureScenario({ behavior: 'investigated' })
    await when.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await then.phaseIs({ phase: 'mapping' })
  })

  test('mapped scenario triggers specification phase', async ({ given, when, then }) => {
    await given.captureScenario({ behavior: 'confirmed' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await given.confirmScenario({ confirmer: 'user' })
    await when.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await then.phaseIs({ phase: 'specification' })
  })

  test('specified scenario triggers implementation phase', async ({ given, when, then }) => {
    await given.captureScenario({ behavior: 'specified' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await given.confirmScenario({ confirmer: 'user' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await when.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await then.phaseIs({ phase: 'implementation' })
  })

  test('all implemented with domain links triggers verification phase', async ({ given, when, then }) => {
    await given.captureScenario({ behavior: 'complete' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await given.confirmScenario({ confirmer: 'user' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await given.linkToDomain({ domainOperation: 'MyDomain.myAction' })
    await when.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await then.phaseIs({ phase: 'verification' })
  })

  test('specified without domain link stays in implementation phase', async ({ given, when, then }) => {
    await given.captureScenario({ behavior: 'awaiting implementation' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await given.confirmScenario({ confirmer: 'user' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await when.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    // Stays at specified (no domain link to advance to implemented)
    await then.phaseIs({ phase: 'implementation' })
  })

  test('mixed captured and implemented triggers discovery phase', async ({ given, when, then }) => {
    // First scenario: advance all the way to implemented
    await given.captureScenario({ behavior: 'fully done' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await given.confirmScenario({ confirmer: 'user' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })
    await given.linkToDomain({ domainOperation: 'Test.action' })
    await given.advanceScenario({ rationale: 'r', promotedBy: 'p' })

    // Second scenario: just captured
    await when.captureScenario({ behavior: 'still captured' })
    await then.phaseIs({ phase: 'discovery' })
  })
})
