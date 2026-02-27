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
    test('captures a scenario and retrieves summary', async ({ given, query, then }) => {
      await given.captureScenario({ behavior: 'user logs in', story: 'Auth' })

      await then.lastCapturedScenarioIs({ stage: 'captured', behavior: 'user logs in' })
      await then.summaryFieldIs({ field: 'captured', value: 1 })
      await then.summaryFieldIs({ field: 'total', value: 1 })
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

      await when.addQuestion({ scenarioId: scenario.id, text: 'What about edge cases?' })
      await then.lastQuestionTextIs({ text: 'What about edge cases?' })

      const question = await query.lastAddedQuestion()
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
    test('filters scenarios by stage', async ({ given, when, query, then }) => {
      await given.captureScenario({ behavior: 'first' })
      const first = await query.lastCapturedScenario()

      await given.captureScenario({ behavior: 'second' })

      await when.advanceScenario({ id: first.id, rationale: 'r', promotedBy: 'p' })

      await then.filteredScenariosLengthIs({ stage: 'captured', count: 1 })
    })

    test('returns advance candidates without open questions', async ({ given, when, query, then }) => {
      await given.captureScenario({ behavior: 'candidate' })
      const scenario = await query.lastCapturedScenario()

      await then.advanceCandidatesLengthIs({ count: 1 })

      await when.addQuestion({ scenarioId: scenario.id, text: 'Blocking?' })

      await then.advanceCandidatesLengthIs({ count: 0 })
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
    test('exports workspace as markdown', async ({ given, then }) => {
      await given.captureScenario({ behavior: 'exportable', story: 'Export' })

      await then.exportContains({ format: 'markdown', text: 'exportable' })
      await then.exportContains({ format: 'markdown', text: 'Captured' })
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
