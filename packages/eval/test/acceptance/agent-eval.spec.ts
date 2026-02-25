import { suite } from '@aver/core'
import { agentEval } from '../../src/domain.js'
import { setDefaultProvider, resetDefaultProvider, mockProvider } from '../../src/index.js'
import { agentEvalAdapter } from './adapter.js'

const { test, act, query, assert } = suite(agentEval, agentEvalAdapter)

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

test('seeds scenario at characterized stage', async ({ act, assert }) => {
  await act.seedScenario({
    behavior: 'User can log in with SSO',
    stage: 'characterized',
    context: 'Authentication flow',
  })
  await assert.scenarioAdvancedTo({ stage: 'characterized' })
})

test('seeds scenario at captured stage (no advancement)', async ({ act, query }) => {
  await act.seedScenario({
    behavior: 'User can reset password',
    stage: 'captured',
    context: 'Password management',
  })
  const scenario = await query.scenarioAfter()
  expect(scenario.stage).toBe('captured')
  expect(scenario.behavior).toBe('User can reset password')
})

test('runs worker and captures output', async ({ act, query }) => {
  await act.queueWorkerResult({
    summary: 'Investigated auth module',
    artifacts: [{
      type: 'investigation',
      name: 'auth-findings',
      summary: 'Auth module investigation',
      content: '# Auth Findings\n\nFound 3 issues.',
    }],
  })
  await act.runWorker({ skill: 'investigation', goal: 'investigate auth' })
  const output = await query.workerOutput()
  expect(output.summary).toBe('Investigated auth module')
  expect(output.artifacts).toHaveLength(1)
})

test('outputContainsArtifact passes for matching type', async ({ act, assert }) => {
  await act.queueWorkerResult({
    summary: 'Analyzed seams',
    artifacts: [{
      type: 'seam-analysis',
      name: 'seam-report',
      summary: 'Seam analysis report',
      content: '# Seam Analysis\n\nFound 2 integration points.',
    }],
  })
  await act.runWorker({ skill: 'investigation', goal: 'analyze seams' })
  await assert.outputContainsArtifact({ type: 'seam-analysis' })
})

test('withinTokenBudget passes when under limit', async ({ act, assert }) => {
  await act.queueWorkerResult({
    summary: 'Quick investigation',
    artifacts: [],
  })
  await act.runWorker({ skill: 'investigation', goal: 'quick check' })
  await assert.withinTokenBudget({ max: 1000 })
})

test('withinTokenBudget fails when over limit', async ({ act, assert }) => {
  await act.queueWorkerResult({
    summary: 'Expensive investigation',
    artifacts: [],
  })
  await act.runWorker({ skill: 'investigation', goal: 'expensive check' })
  await expect(assert.withinTokenBudget({ max: 100 })).rejects.toThrow('exceeds budget')
})

test('outputMeetsRubric passes with matching mock rule', async ({ act, assert }) => {
  await act.queueWorkerResult({
    summary: 'Detailed investigation findings with structured analysis',
    artifacts: [],
  })
  await act.runWorker({ skill: 'investigation', goal: 'investigate quality' })
  await assert.outputMeetsRubric({ rubric: 'investigation quality' })
})

test('outputMeetsRubric fails with non-matching rule', async ({ act, assert }) => {
  await act.queueWorkerResult({
    summary: 'Basic output',
    artifacts: [],
  })
  await act.runWorker({ skill: 'investigation', goal: 'basic work' })
  await expect(assert.outputMeetsRubric({ rubric: 'impossible standard' })).rejects.toThrow('Rubric failed')
})
