import { describe, beforeEach } from 'vitest'
import { suite, resetRegistry } from '@aver/core'
import { averMcp } from './domains/aver-mcp'
import { averMcpAdapter } from './adapters/aver-mcp.unit'

describe('MCP Workspace Tools (acceptance)', () => {
  const { test } = suite(averMcp, averMcpAdapter)

  beforeEach(() => {
    resetRegistry()
  })

  describe('scenario lifecycle via MCP', () => {
    test('captures a scenario and retrieves summary', async ({ act, assert }) => {
      await act.callTool({
        tool: 'capture_scenario',
        input: { behavior: 'user logs in', story: 'Auth' },
      })
      await assert.toolResultContains({ path: 'stage', expected: 'captured' })
      await assert.toolResultContains({ path: 'behavior', expected: 'user logs in' })

      await act.callTool({ tool: 'get_scenario_summary' })
      await assert.toolResultContains({ path: 'captured', expected: 1 })
      await assert.toolResultContains({ path: 'total', expected: 1 })
    })

    test('advances a scenario to the next stage', async ({ act, assert, query }) => {
      await act.callTool({
        tool: 'capture_scenario',
        input: { behavior: 'advance test' },
      })
      const captured = await query.lastToolResult() as any
      const id = captured.id

      await act.callTool({
        tool: 'advance_scenario',
        input: { id, rationale: 'investigated', promotedBy: 'dev' },
      })
      await assert.toolResultContains({ path: 'stage', expected: 'characterized' })
      await assert.toolResultContains({ path: 'promotedFrom', expected: 'captured' })
    })

    test('regresses a scenario to an earlier stage', async ({ act, assert, query }) => {
      await act.callTool({
        tool: 'capture_scenario',
        input: { behavior: 'regress test' },
      })
      const captured = await query.lastToolResult() as any

      await act.callTool({
        tool: 'advance_scenario',
        input: { id: captured.id, rationale: 'r', promotedBy: 'p' },
      })

      await act.callTool({
        tool: 'regress_scenario',
        input: { id: captured.id, targetStage: 'captured', rationale: 'changed mind' },
      })
      await assert.toolResultContains({ path: 'stage', expected: 'captured' })
      await assert.toolResultContains({ path: 'regressionRationale', expected: 'changed mind' })
    })
  })

  describe('questions via MCP', () => {
    test('adds and resolves a question on a scenario', async ({ act, assert, query }) => {
      await act.callTool({
        tool: 'capture_scenario',
        input: { behavior: 'question test' },
      })
      const scenario = await query.lastToolResult() as any

      await act.callTool({
        tool: 'add_question',
        input: { scenarioId: scenario.id, text: 'What about edge cases?' },
      })
      const question = await query.lastToolResult() as any
      await assert.toolResultContains({ path: 'text', expected: 'What about edge cases?' })

      await act.callTool({
        tool: 'resolve_question',
        input: { scenarioId: scenario.id, questionId: question.id, answer: 'Handle them' },
      })
      await assert.toolResultContains({ path: 'success', expected: true })
    })
  })

  describe('workflow phase via MCP', () => {
    test('detects kickoff phase for empty workspace', async ({ act, assert }) => {
      await act.callTool({ tool: 'get_workflow_phase' })
      await assert.toolResultContains({ path: 'name', expected: 'kickoff' })
    })

    test('detects investigation phase after capturing', async ({ act, assert }) => {
      await act.callTool({
        tool: 'capture_scenario',
        input: { behavior: 'something' },
      })
      await act.callTool({ tool: 'get_workflow_phase' })
      await assert.toolResultContains({ path: 'name', expected: 'investigation' })
    })
  })

  describe('filtering and candidates via MCP', () => {
    test('filters scenarios by stage', async ({ act, assert, query }) => {
      await act.callTool({
        tool: 'capture_scenario',
        input: { behavior: 'first' },
      })
      const first = await query.lastToolResult() as any

      await act.callTool({
        tool: 'capture_scenario',
        input: { behavior: 'second' },
      })

      await act.callTool({
        tool: 'advance_scenario',
        input: { id: first.id, rationale: 'r', promotedBy: 'p' },
      })

      await act.callTool({
        tool: 'get_scenarios',
        input: { stage: 'captured' },
      })
      await assert.toolResultHasLength({ length: 1 })
      await assert.toolResultContains({ path: '0.behavior', expected: 'second' })
    })

    test('returns advance candidates without open questions', async ({ act, assert, query }) => {
      await act.callTool({
        tool: 'capture_scenario',
        input: { behavior: 'candidate' },
      })
      const scenario = await query.lastToolResult() as any

      await act.callTool({ tool: 'get_advance_candidates' })
      await assert.toolResultHasLength({ length: 1 })

      await act.callTool({
        tool: 'add_question',
        input: { scenarioId: scenario.id, text: 'Blocking?' },
      })

      await act.callTool({ tool: 'get_advance_candidates' })
      await assert.toolResultHasLength({ length: 0 })
    })
  })

  describe('domain linking via MCP', () => {
    test('links a scenario to a domain operation', async ({ act, assert, query }) => {
      await act.callTool({
        tool: 'capture_scenario',
        input: { behavior: 'linkable' },
      })
      const scenario = await query.lastToolResult() as any

      await act.callTool({
        tool: 'link_to_domain',
        input: { scenarioId: scenario.id, domainOperation: 'Cart.addItem' },
      })
      await assert.toolResultContains({ path: 'success', expected: true })

      await act.callTool({
        tool: 'get_scenarios',
        input: {},
      })
      await assert.toolResultContains({ path: '0.domainOperation', expected: 'Cart.addItem' })
    })
  })

  describe('export and import via MCP', () => {
    test('exports workspace as markdown', async ({ act, query }) => {
      await act.callTool({
        tool: 'capture_scenario',
        input: { behavior: 'exportable', story: 'Export' },
      })

      await act.callTool({
        tool: 'export_scenarios',
        input: { format: 'markdown' },
      })
      const md = await query.lastToolResult() as string
      if (!md.includes('exportable'))
        throw new Error('Expected markdown to contain "exportable"')
      if (!md.includes('Captured'))
        throw new Error('Expected markdown to contain "Captured"')
    })

    test('exports and imports JSON with deduplication', async ({ act, assert, query }) => {
      await act.callTool({
        tool: 'capture_scenario',
        input: { behavior: 'original' },
      })

      await act.callTool({
        tool: 'export_scenarios',
        input: { format: 'json' },
      })
      const json = await query.lastToolResult() as string

      // Import same data — should skip the duplicate
      await act.callTool({
        tool: 'import_scenarios',
        input: { json },
      })
      await assert.toolResultContains({ path: 'added', expected: 0 })
      await assert.toolResultContains({ path: 'skipped', expected: 1 })
    })
  })
})
