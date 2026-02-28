import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  getScenarioSummaryHandler,
  getScenariosHandler,
  captureScenarioHandler,
  advanceScenarioHandler,
  revisitScenarioHandler,
  addQuestionHandler,
  resolveQuestionHandler,
  linkToDomainHandler,
  confirmScenarioHandler,
  getWorkflowPhaseHandler,
  getAdvanceCandidatesHandler,
  exportScenariosHandler,
  importScenariosHandler,
  updateScenarioHandler,
  clearWorkspaceCache,
} from '../../src/tools/workspace'

describe('workspace tool handlers', () => {
  let dir: string
  const projectId = 'test'

  beforeEach(() => {
    clearWorkspaceCache()
    dir = mkdtempSync(join(tmpdir(), 'aver-mcp-workspace-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  describe('capture_scenario', () => {
    it('creates a captured scenario with observed mode', async () => {
      const result = await captureScenarioHandler({ behavior: 'API returns 200', context: 'POST /orders', mode: 'observed' }, dir, projectId)
      expect(result.stage).toBe('captured')
      expect(result.behavior).toBe('API returns 200')
      expect(result.context).toBe('POST /orders')
      expect(result.mode).toBe('observed')
      expect(result.id).toBeDefined()
    })

    it('creates a captured scenario without context', async () => {
      const result = await captureScenarioHandler({ behavior: 'items display in list' }, dir, projectId)
      expect(result.stage).toBe('captured')
      expect(result.behavior).toBe('items display in list')
    })

    it('creates a captured scenario with intended mode', async () => {
      const result = await captureScenarioHandler({ behavior: 'user can add to cart', story: 'checkout flow', mode: 'intended' }, dir, projectId)
      expect(result.stage).toBe('captured')
      expect(result.behavior).toBe('user can add to cart')
      expect(result.story).toBe('checkout flow')
      expect(result.mode).toBe('intended')
    })

    it('creates a captured scenario with intended mode without story', async () => {
      const result = await captureScenarioHandler({ behavior: 'validation rejects empty name', mode: 'intended' }, dir, projectId)
      expect(result.stage).toBe('captured')
      expect(result.behavior).toBe('validation rejects empty name')
      expect(result.mode).toBe('intended')
    })
  })

  describe('get_scenario_summary', () => {
    it('returns counts per stage', async () => {
      await captureScenarioHandler({ behavior: 'a' }, dir, projectId)
      await captureScenarioHandler({ behavior: 'b' }, dir, projectId)
      await captureScenarioHandler({ behavior: 'c', mode: 'intended' }, dir, projectId)

      const summary = await getScenarioSummaryHandler(dir, projectId)
      expect(summary.captured).toBe(3)
      expect(summary.characterized).toBe(0)
      expect(summary.mapped).toBe(0)
      expect(summary.specified).toBe(0)
      expect(summary.implemented).toBe(0)
      expect(summary.total).toBe(3)
      expect(summary.openQuestions).toBe(0)
    })

    it('returns zeros for empty workspace', async () => {
      const summary = await getScenarioSummaryHandler(dir, projectId)
      expect(summary.total).toBe(0)
    })
  })

  describe('get_scenarios', () => {
    it('returns all scenarios when no filter', async () => {
      await captureScenarioHandler({ behavior: 'a' }, dir, projectId)
      await captureScenarioHandler({ behavior: 'b', mode: 'intended' }, dir, projectId)

      const scenarios = await getScenariosHandler({}, dir, projectId)
      expect(scenarios).toHaveLength(2)
    })

    it('filters by stage', async () => {
      await captureScenarioHandler({ behavior: 'a' }, dir, projectId)
      await captureScenarioHandler({ behavior: 'b' }, dir, projectId)

      const scenarios = await getScenariosHandler({ stage: 'captured' }, dir, projectId)
      expect(scenarios).toHaveLength(2)
    })

    it('filters by keyword', async () => {
      await captureScenarioHandler({ behavior: 'API returns 200' }, dir, projectId)
      await captureScenarioHandler({ behavior: 'page loads' }, dir, projectId)

      const scenarios = await getScenariosHandler({ keyword: 'API' }, dir, projectId)
      expect(scenarios).toHaveLength(1)
      expect(scenarios[0].behavior).toBe('API returns 200')
    })
  })

  describe('advance_scenario', () => {
    it('advances captured to characterized', async () => {
      const scenario = await captureScenarioHandler({ behavior: 'a' }, dir, projectId)
      const { scenario: advanced } = await advanceScenarioHandler({ id: scenario.id, rationale: 'investigated', promotedBy: 'dev' }, dir, projectId)
      expect(advanced.stage).toBe('characterized')
    })

    it('advances characterized to mapped when confirmedBy is set', async () => {
      const scenario = await captureScenarioHandler({ behavior: 'a' }, dir, projectId)
      await advanceScenarioHandler({ id: scenario.id, rationale: 'step 1', promotedBy: 'dev' }, dir, projectId)
      await confirmScenarioHandler({ id: scenario.id, confirmer: 'business-user' }, dir, projectId)
      const { scenario: advanced } = await advanceScenarioHandler({ id: scenario.id, rationale: 'step 2', promotedBy: 'dev' }, dir, projectId)
      expect(advanced.stage).toBe('mapped')
    })

    it('blocks characterized to mapped without confirmedBy', async () => {
      const scenario = await captureScenarioHandler({ behavior: 'a' }, dir, projectId)
      await advanceScenarioHandler({ id: scenario.id, rationale: 'step 1', promotedBy: 'dev' }, dir, projectId)
      await expect(
        advanceScenarioHandler({ id: scenario.id, rationale: 'step 2', promotedBy: 'dev' }, dir, projectId)
      ).rejects.toThrow('confirmedBy is required')
    })

    it('throws for unknown scenario', async () => {
      await expect(
        advanceScenarioHandler({ id: 'nonexistent', rationale: 'test', promotedBy: 'dev' }, dir, projectId)
      ).rejects.toThrow('Scenario not found')
    })
  })

  describe('revisit_scenario', () => {
    it('revisits characterized back to captured', async () => {
      const scenario = await captureScenarioHandler({ behavior: 'a' }, dir, projectId)
      await advanceScenarioHandler({ id: scenario.id, rationale: 'advance', promotedBy: 'dev' }, dir, projectId)
      const revisited = await revisitScenarioHandler({ id: scenario.id, targetStage: 'captured', rationale: 'rethinking' }, dir, projectId)
      expect(revisited.stage).toBe('captured')
    })

    it('throws for unknown scenario', async () => {
      await expect(
        revisitScenarioHandler({ id: 'nonexistent', targetStage: 'captured', rationale: 'test' }, dir, projectId)
      ).rejects.toThrow('Scenario not found')
    })
  })

  describe('add_question', () => {
    it('adds a question to a scenario', async () => {
      const scenario = await captureScenarioHandler({ behavior: 'a' }, dir, projectId)
      const question = await addQuestionHandler({ scenarioId: scenario.id, text: 'What triggers this?' }, dir, projectId)
      expect(question.id).toBeDefined()
      expect(question.text).toBe('What triggers this?')
    })

    it('question appears in summary as open', async () => {
      const scenario = await captureScenarioHandler({ behavior: 'a' }, dir, projectId)
      await addQuestionHandler({ scenarioId: scenario.id, text: 'Why?' }, dir, projectId)
      const summary = await getScenarioSummaryHandler(dir, projectId)
      expect(summary.openQuestions).toBe(1)
    })
  })

  describe('resolve_question', () => {
    it('resolves an open question', async () => {
      const scenario = await captureScenarioHandler({ behavior: 'a' }, dir, projectId)
      const question = await addQuestionHandler({ scenarioId: scenario.id, text: 'Why?' }, dir, projectId)
      await resolveQuestionHandler({ scenarioId: scenario.id, questionId: question.id, answer: 'Because reasons' }, dir, projectId)

      const summary = await getScenarioSummaryHandler(dir, projectId)
      expect(summary.openQuestions).toBe(0)
    })
  })

  describe('link_to_domain', () => {
    it('links a scenario to domain artifacts', async () => {
      const scenario = await captureScenarioHandler({ behavior: 'a' }, dir, projectId)
      await linkToDomainHandler(
        { scenarioId: scenario.id, domainOperation: 'Cart.addItem', testNames: ['adds item to cart'] },
        dir,
        projectId,
      )

      const scenarios = await getScenariosHandler({}, dir, projectId)
      expect(scenarios[0].domainOperation).toBe('Cart.addItem')
      expect(scenarios[0].testNames).toEqual(['adds item to cart'])
    })
  })

  describe('confirm_scenario', () => {
    it('confirms a scenario via confirmScenarioHandler', async () => {
      const scenario = await captureScenarioHandler({ behavior: 'a' }, dir, projectId)
      await advanceScenarioHandler({ id: scenario.id, rationale: 'step 1', promotedBy: 'dev' }, dir, projectId)
      await confirmScenarioHandler({ id: scenario.id, confirmer: 'business-user' }, dir, projectId)
      const scenarios = await getScenariosHandler({}, dir, projectId)
      expect(scenarios[0].confirmedBy).toBe('business-user')
    })
  })

  describe('get_workflow_phase', () => {
    it('returns kickoff for empty workspace', async () => {
      const phase = await getWorkflowPhaseHandler(dir, projectId)
      expect(phase.name).toBe('kickoff')
    })

    it('returns investigation after captured scenarios', async () => {
      await captureScenarioHandler({ behavior: 'a' }, dir, projectId)
      const phase = await getWorkflowPhaseHandler(dir, projectId)
      expect(phase.name).toBe('investigation')
    })
  })

  describe('get_advance_candidates', () => {
    it('returns scenarios eligible for advancement', async () => {
      await captureScenarioHandler({ behavior: 'a' }, dir, projectId)
      await captureScenarioHandler({ behavior: 'b' }, dir, projectId)

      const candidates = await getAdvanceCandidatesHandler(dir, projectId)
      expect(candidates).toHaveLength(2)
    })

    it('excludes scenarios with open questions', async () => {
      const scenario = await captureScenarioHandler({ behavior: 'a' }, dir, projectId)
      await addQuestionHandler({ scenarioId: scenario.id, text: 'unclear' }, dir, projectId)
      await captureScenarioHandler({ behavior: 'b' }, dir, projectId)

      const candidates = await getAdvanceCandidatesHandler(dir, projectId)
      expect(candidates).toHaveLength(1)
      expect(candidates[0].behavior).toBe('b')
    })
  })

  describe('update_scenario', () => {
    it('updates behavior field', async () => {
      const scenario = await captureScenarioHandler({ behavior: 'old' }, dir, projectId)
      const updated = await updateScenarioHandler({ id: scenario.id, behavior: 'new' }, dir, projectId)
      expect(updated.behavior).toBe('new')
    })

    it('updates rules array', async () => {
      const scenario = await captureScenarioHandler({ behavior: 'test' }, dir, projectId)
      const updated = await updateScenarioHandler({ id: scenario.id, rules: ['r1', 'r2'] }, dir, projectId)
      expect(updated.rules).toEqual(['r1', 'r2'])
    })

    it('updates examples array', async () => {
      const scenario = await captureScenarioHandler({ behavior: 'test' }, dir, projectId)
      const updated = await updateScenarioHandler({
        id: scenario.id,
        examples: [{ description: 'ex', expectedOutcome: 'pass' }]
      }, dir, projectId)
      expect(updated.examples).toHaveLength(1)
    })

    it('updates seams array', async () => {
      const scenario = await captureScenarioHandler({ behavior: 'test' }, dir, projectId)
      const updated = await updateScenarioHandler({
        id: scenario.id,
        seams: [{ type: 'http', location: '/api', description: 'endpoint' }]
      }, dir, projectId)
      expect(updated.seams).toHaveLength(1)
    })

    it('updates constraints array', async () => {
      const scenario = await captureScenarioHandler({ behavior: 'test' }, dir, projectId)
      const updated = await updateScenarioHandler({
        id: scenario.id,
        constraints: ['must be idempotent']
      }, dir, projectId)
      expect(updated.constraints).toEqual(['must be idempotent'])
    })

    it('throws for nonexistent scenario', async () => {
      await expect(updateScenarioHandler({ id: 'nope', behavior: 'x' }, dir, projectId))
        .rejects.toThrow('Scenario not found')
    })
  })

  describe('export_scenarios', () => {
    it('exports as markdown', async () => {
      await captureScenarioHandler({ behavior: 'test item' }, dir, projectId)
      const result = await exportScenariosHandler({ format: 'markdown' }, dir, projectId)
      expect(result).toContain('test item')
      expect(result).toContain('# Scenario Summary')
    })

    it('exports as json', async () => {
      await captureScenarioHandler({ behavior: 'test item' }, dir, projectId)
      const result = await exportScenariosHandler({ format: 'json' }, dir, projectId)
      const parsed = JSON.parse(result)
      expect(parsed.scenarios).toHaveLength(1)
      expect(parsed.scenarios[0].behavior).toBe('test item')
    })
  })

  describe('import_scenarios', () => {
    it('imports scenarios from json', async () => {
      // Create a source workspace with scenarios
      await captureScenarioHandler({ behavior: 'from source' }, dir, projectId)
      const exported = await exportScenariosHandler({ format: 'json' }, dir, projectId)

      // Create a different target workspace
      const targetDir = mkdtempSync(join(tmpdir(), 'aver-mcp-workspace-target-'))
      try {
        const result = await importScenariosHandler({ json: exported }, targetDir, projectId)
        expect(result.added).toBe(1)
        expect(result.skipped).toBe(0)

        // Verify the imported scenarios
        const scenarios = await getScenariosHandler({}, targetDir, projectId)
        expect(scenarios).toHaveLength(1)
        expect(scenarios[0].behavior).toBe('from source')
      } finally {
        rmSync(targetDir, { recursive: true, force: true })
      }
    })

    it('skips duplicate scenarios on import', async () => {
      await captureScenarioHandler({ behavior: 'existing' }, dir, projectId)
      const exported = await exportScenariosHandler({ format: 'json' }, dir, projectId)

      // Import back into same workspace (duplicate IDs)
      const result = await importScenariosHandler({ json: exported }, dir, projectId)
      expect(result.added).toBe(0)
      expect(result.skipped).toBe(1)
    })
  })
})
