import { suite } from '@aver/core'
import { agentEval } from '../../../src/eval/domain.js'
import { setDefaultProvider, resetDefaultProvider, mockProvider } from '../../../src/eval/index.js'
import { agentEvalAdapter } from './adapter.js'

const { test } = suite(agentEval, agentEvalAdapter)

beforeAll(() => {
  setDefaultProvider(mockProvider([
    {
      match: 'investigation quality',
      verdict: { pass: true, reasoning: 'Output contains structured findings' },
    },
    {
      match: 'impossible standard',
      verdict: { pass: false, reasoning: 'Does not meet unrealistic bar' },
    },
  ]))
})

afterAll(() => {
  resetDefaultProvider()
})

test('seeds scenario at characterized stage', async ({ given, then }) => {
  await given.seedScenario({
    behavior: 'User can log in with SSO',
    stage: 'characterized',
    context: 'Authentication flow',
  })
  await then.scenarioAdvancedTo({ stage: 'characterized' })
})

test('seeds scenario at captured stage (no advancement)', async ({ given, query }) => {
  await given.seedScenario({
    behavior: 'User can reset password',
    stage: 'captured',
    context: 'Password management',
  })
  const scenario = await query.scenarioAfter()
  expect(scenario.stage).toBe('captured')
  expect(scenario.behavior).toBe('User can reset password')
  // TODO: consider adding domain assertion
})

test('runs worker and captures output', async ({ given, when, query }) => {
  await given.queueWorkerResult({
    summary: 'Investigated auth module',
    artifacts: [{
      type: 'investigation',
      name: 'auth-findings',
      summary: 'Auth module investigation',
      content: '# Auth Findings\n\nFound 3 issues.',
    }],
  })
  await when.runWorker({ skill: 'investigation', goal: 'investigate auth' })
  const output = await query.workerOutput()
  expect(output.summary).toBe('Investigated auth module')
  expect(output.artifacts).toHaveLength(1)
  // TODO: consider adding domain assertion
})

test('outputContainsArtifact passes for matching type', async ({ given, when, then }) => {
  await given.queueWorkerResult({
    summary: 'Analyzed seams',
    artifacts: [{
      type: 'seam-analysis',
      name: 'seam-report',
      summary: 'Seam analysis report',
      content: '# Seam Analysis\n\nFound 2 integration points.',
    }],
  })
  await when.runWorker({ skill: 'investigation', goal: 'analyze seams' })
  await then.outputContainsArtifact({ type: 'seam-analysis' })
})

test('withinTokenBudget passes when under limit', async ({ given, when, then }) => {
  await given.queueWorkerResult({
    summary: 'Quick investigation',
    artifacts: [],
  })
  await when.runWorker({ skill: 'investigation', goal: 'quick check' })
  await then.withinTokenBudget({ max: 1000 })
})

test('withinTokenBudget fails when over limit', async ({ given, when, then }) => {
  await given.queueWorkerResult({
    summary: 'Expensive investigation',
    artifacts: [],
  })
  await when.runWorker({ skill: 'investigation', goal: 'expensive check' })
  await expect(then.withinTokenBudget({ max: 100 })).rejects.toThrow('exceeds budget')
})

test('outputMeetsRubric passes with matching mock rule', async ({ given, when, then }) => {
  await given.queueWorkerResult({
    summary: 'Detailed investigation findings with structured analysis',
    artifacts: [],
  })
  await when.runWorker({ skill: 'investigation', goal: 'investigate quality' })
  await then.outputMeetsRubric({ rubric: 'investigation quality' })
})

test('outputMeetsRubric fails with non-matching rule', async ({ given, when, then }) => {
  await given.queueWorkerResult({
    summary: 'Basic output',
    artifacts: [],
  })
  await when.runWorker({ skill: 'investigation', goal: 'basic work' })
  await expect(then.outputMeetsRubric({ rubric: 'impossible standard' })).rejects.toThrow('Rubric failed')
})
