import { describe, beforeEach, expect } from 'vitest'
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
    test('captures a scenario and retrieves summary', async ({ given, query, then }) => {
      await given.captureScenario({ behavior: 'user logs in', story: 'Auth' })

      const captured = await query.lastCapturedScenario()
      // TODO: consider adding domain assertion for scenario capture
      expect(captured.stage).toBe('captured')
      expect(captured.behavior).toBe('user logs in')

      const summary = await query.scenarioSummary()
      // TODO: consider adding domain assertion for scenario summary
      expect(summary.captured).toBe(1)
      expect(summary.total).toBe(1)
    })

    test('advances a scenario to the next stage', async ({ given, when, query, then }) => {
      await given.captureScenario({ behavior: 'advance test' })
      const captured = await query.lastCapturedScenario()

      await when.advanceScenario({ id: captured.id, rationale: 'investigated', promotedBy: 'dev' })
      await then.scenarioHasStage({ id: captured.id, stage: 'characterized' })
    })

    test('revisits a scenario to an earlier stage', async ({ given, when, query, then }) => {
      await given.captureScenario({ behavior: 'revisit test' })
      const captured = await query.lastCapturedScenario()

      await given.advanceScenario({ id: captured.id, rationale: 'r', promotedBy: 'p' })
      await when.revisitScenario({ id: captured.id, targetStage: 'captured', rationale: 'changed mind' })

      await then.scenarioHasStage({ id: captured.id, stage: 'captured' })
      await then.scenarioHasRevisitRationale({ id: captured.id, rationale: 'changed mind' })
    })

    test('deletes a scenario from the workspace', async ({ given, when, query, then }) => {
      await given.captureScenario({ behavior: 'to be deleted' })
      const captured = await query.lastCapturedScenario()

      await then.scenarioCountIs({ count: 1 })
      await when.deleteScenario({ id: captured.id })
      await then.scenarioCountIs({ count: 0 })
    })
  })

  describe('questions', () => {
    test('adds and resolves a question on a scenario', async ({ given, when, query, then }) => {
      await given.captureScenario({ behavior: 'question test' })
      const scenario = await query.lastCapturedScenario()

      await given.addQuestion({ scenarioId: scenario.id, text: 'What about edge cases?' })
      const question = await query.lastAddedQuestion()
      // TODO: consider adding domain assertion for question text
      expect(question.text).toBe('What about edge cases?')

      await when.resolveQuestion({ scenarioId: scenario.id, questionId: question.id, answer: 'Handle them' })
      await then.questionIsResolved({ scenarioId: scenario.id, questionId: question.id })
    })
  })

  describe('workflow phase', () => {
    test('detects kickoff phase for empty workspace', async ({ then }) => {
      await then.workflowPhaseIs({ phase: 'kickoff' })
    })

    test('detects investigation phase after capturing', async ({ when, then }) => {
      await when.captureScenario({ behavior: 'something' })
      await then.workflowPhaseIs({ phase: 'investigation' })
    })
  })

  describe('filtering and candidates', () => {
    test('filters scenarios by stage', async ({ given, when, query }) => {
      await given.captureScenario({ behavior: 'first' })
      const first = await query.lastCapturedScenario()

      await given.captureScenario({ behavior: 'second' })

      await when.advanceScenario({ id: first.id, rationale: 'r', promotedBy: 'p' })

      const captured = await query.scenarios({ stage: 'captured' })
      // TODO: consider adding domain assertion for scenario filtering
      expect(captured).toHaveLength(1)
      expect(captured[0].behavior).toBe('second')
    })

    test('returns advance candidates without open questions', async ({ given, when, query }) => {
      await given.captureScenario({ behavior: 'candidate' })
      const scenario = await query.lastCapturedScenario()

      const before = await query.advanceCandidates()
      // TODO: consider adding domain assertion for advance candidates
      expect(before).toHaveLength(1)

      await when.addQuestion({ scenarioId: scenario.id, text: 'Blocking?' })

      const after = await query.advanceCandidates()
      // TODO: consider adding domain assertion for question blocking advancement
      expect(after).toHaveLength(0)
    })
  })

  describe('domain linking', () => {
    test('links a scenario to a domain operation', async ({ given, when, query, then }) => {
      await given.captureScenario({ behavior: 'linkable' })
      const scenario = await query.lastCapturedScenario()

      await when.linkToDomain({ scenarioId: scenario.id, domainOperation: 'Cart.addItem' })
      await then.scenarioHasDomainOperation({ id: scenario.id, operation: 'Cart.addItem' })
    })
  })

  describe('export and import', () => {
    test('exports workspace as markdown', async ({ given, query }) => {
      await given.captureScenario({ behavior: 'exportable', story: 'Export' })

      const md = await query.exportedScenarios({ format: 'markdown' })
      // TODO: consider adding domain assertion for markdown export
      expect(md).toContain('exportable')
      expect(md).toContain('Captured')
    })

    test('exports and imports JSON with deduplication', async ({ given, when, query, then }) => {
      await given.captureScenario({ behavior: 'original' })

      const json = await query.exportedScenarios({ format: 'json' })

      // Import same data — should skip the duplicate
      await when.importScenarios({ json })
      await then.importResultIs({ added: 0, skipped: 1 })
    })
  })
})
