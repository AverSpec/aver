import { describe, beforeEach } from 'vitest'
import { suite, registerAdapter, resetRegistry } from '@aver/core'
import { averMcp } from './domains/aver-mcp'
import { averMcpAdapter } from './adapters/aver-mcp.unit'
import { averMcpIntegrationAdapter } from './adapters/aver-mcp.mcp'

registerAdapter(averMcpAdapter)
registerAdapter(averMcpIntegrationAdapter)

describe('MCP Workspace Tools (acceptance)', () => {
  const { test } = suite(averMcp)

  beforeEach(() => {
    resetRegistry()
  })

  describe('scenario lifecycle', () => {
    test('captures a scenario and retrieves summary', async ({ act, query, assert }) => {
      await act.captureScenario({ behavior: 'user logs in', story: 'Auth' })

      const captured = await query.lastCapturedScenario()
      if (captured.stage !== 'captured')
        throw new Error(`Expected 'captured', got '${captured.stage}'`)
      if (captured.behavior !== 'user logs in')
        throw new Error(`Expected 'user logs in', got '${captured.behavior}'`)

      const summary = await query.scenarioSummary()
      if (summary.captured !== 1)
        throw new Error(`Expected 1 captured, got ${summary.captured}`)
      if (summary.total !== 1)
        throw new Error(`Expected 1 total, got ${summary.total}`)
    })

    test('advances a scenario to the next stage', async ({ act, query, assert }) => {
      await act.captureScenario({ behavior: 'advance test' })
      const captured = await query.lastCapturedScenario()

      await act.advanceScenario({ id: captured.id, rationale: 'investigated', promotedBy: 'dev' })
      await assert.scenarioHasStage({ id: captured.id, stage: 'characterized' })
    })

    test('regresses a scenario to an earlier stage', async ({ act, query, assert }) => {
      await act.captureScenario({ behavior: 'regress test' })
      const captured = await query.lastCapturedScenario()

      await act.advanceScenario({ id: captured.id, rationale: 'r', promotedBy: 'p' })
      await act.regressScenario({ id: captured.id, targetStage: 'captured', rationale: 'changed mind' })

      await assert.scenarioHasStage({ id: captured.id, stage: 'captured' })
      await assert.scenarioHasRegressionRationale({ id: captured.id, rationale: 'changed mind' })
    })

    test('deletes a scenario from the workspace', async ({ act, query, assert }) => {
      await act.captureScenario({ behavior: 'to be deleted' })
      const captured = await query.lastCapturedScenario()

      await assert.scenarioCountIs({ count: 1 })
      await act.deleteScenario({ id: captured.id })
      await assert.scenarioCountIs({ count: 0 })
    })
  })

  describe('questions', () => {
    test('adds and resolves a question on a scenario', async ({ act, query, assert }) => {
      await act.captureScenario({ behavior: 'question test' })
      const scenario = await query.lastCapturedScenario()

      await act.addQuestion({ scenarioId: scenario.id, text: 'What about edge cases?' })
      const question = await query.lastAddedQuestion()
      if (question.text !== 'What about edge cases?')
        throw new Error(`Expected 'What about edge cases?', got '${question.text}'`)

      await act.resolveQuestion({ scenarioId: scenario.id, questionId: question.id, answer: 'Handle them' })
      await assert.questionIsResolved({ scenarioId: scenario.id, questionId: question.id })
    })
  })

  describe('workflow phase', () => {
    test('detects kickoff phase for empty workspace', async ({ assert }) => {
      await assert.workflowPhaseIs({ phase: 'kickoff' })
    })

    test('detects investigation phase after capturing', async ({ act, assert }) => {
      await act.captureScenario({ behavior: 'something' })
      await assert.workflowPhaseIs({ phase: 'investigation' })
    })
  })

  describe('filtering and candidates', () => {
    test('filters scenarios by stage', async ({ act, query }) => {
      await act.captureScenario({ behavior: 'first' })
      const first = await query.lastCapturedScenario()

      await act.captureScenario({ behavior: 'second' })

      await act.advanceScenario({ id: first.id, rationale: 'r', promotedBy: 'p' })

      const captured = await query.scenarios({ stage: 'captured' })
      if (captured.length !== 1)
        throw new Error(`Expected 1 captured scenario, got ${captured.length}`)
      if (captured[0].behavior !== 'second')
        throw new Error(`Expected 'second', got '${captured[0].behavior}'`)
    })

    test('returns advance candidates without open questions', async ({ act, query }) => {
      await act.captureScenario({ behavior: 'candidate' })
      const scenario = await query.lastCapturedScenario()

      const before = await query.advanceCandidates()
      if (before.length !== 1)
        throw new Error(`Expected 1 candidate, got ${before.length}`)

      await act.addQuestion({ scenarioId: scenario.id, text: 'Blocking?' })

      const after = await query.advanceCandidates()
      if (after.length !== 0)
        throw new Error(`Expected 0 candidates, got ${after.length}`)
    })
  })

  describe('domain linking', () => {
    test('links a scenario to a domain operation', async ({ act, query, assert }) => {
      await act.captureScenario({ behavior: 'linkable' })
      const scenario = await query.lastCapturedScenario()

      await act.linkToDomain({ scenarioId: scenario.id, domainOperation: 'Cart.addItem' })
      await assert.scenarioHasDomainOperation({ id: scenario.id, operation: 'Cart.addItem' })
    })
  })

  describe('export and import', () => {
    test('exports workspace as markdown', async ({ act, query }) => {
      await act.captureScenario({ behavior: 'exportable', story: 'Export' })

      const md = await query.exportedScenarios({ format: 'markdown' })
      if (!md.includes('exportable'))
        throw new Error('Expected markdown to contain "exportable"')
      if (!md.includes('Captured'))
        throw new Error('Expected markdown to contain "Captured"')
    })

    test('exports and imports JSON with deduplication', async ({ act, query, assert }) => {
      await act.captureScenario({ behavior: 'original' })

      const json = await query.exportedScenarios({ format: 'json' })

      // Import same data — should skip the duplicate
      await act.importScenarios({ json })
      await assert.importResultIs({ added: 0, skipped: 1 })
    })
  })
})
