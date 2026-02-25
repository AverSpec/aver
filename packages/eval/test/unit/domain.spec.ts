import { describe, it, expect } from 'vitest'
import { agentEval } from '../../src/domain'

describe('AgentEval domain', () => {
  it('has the correct domain name', () => {
    expect(agentEval.name).toBe('AgentEval')
  })

  it('declares worker-level actions', () => {
    expect(agentEval.vocabulary.actions.seedScenario).toBeDefined()
    expect(agentEval.vocabulary.actions.seedScenario.kind).toBe('action')
    expect(agentEval.vocabulary.actions.queueWorkerResult).toBeDefined()
    expect(agentEval.vocabulary.actions.queueWorkerResult.kind).toBe('action')
    expect(agentEval.vocabulary.actions.runWorker).toBeDefined()
    expect(agentEval.vocabulary.actions.runWorker.kind).toBe('action')
  })

  it('declares pipeline-level action', () => {
    expect(agentEval.vocabulary.actions.runPipeline).toBeDefined()
    expect(agentEval.vocabulary.actions.runPipeline.kind).toBe('action')
  })

  it('declares queries', () => {
    expect(agentEval.vocabulary.queries.workerOutput).toBeDefined()
    expect(agentEval.vocabulary.queries.scenarioAfter).toBeDefined()
    expect(agentEval.vocabulary.queries.tokenCost).toBeDefined()
  })

  it('declares 4 assertions', () => {
    const assertionNames = Object.keys(agentEval.vocabulary.assertions)
    expect(assertionNames).toHaveLength(4)
    expect(assertionNames).toContain('scenarioAdvancedTo')
    expect(assertionNames).toContain('outputContainsArtifact')
    expect(assertionNames).toContain('withinTokenBudget')
    expect(assertionNames).toContain('outputMeetsRubric')
  })
})
