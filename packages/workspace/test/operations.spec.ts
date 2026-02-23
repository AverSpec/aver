import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { WorkspaceOps } from '../src/operations'
import { WorkspaceStore } from '../src/storage'

describe('WorkspaceOps', () => {
  let dir: string
  let ops: WorkspaceOps

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aver-workspace-'))
    const store = new WorkspaceStore(dir, 'test-project')
    ops = new WorkspaceOps(store)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  describe('captureScenario', () => {
    it('creates a captured scenario with observed mode and persists it', async () => {
      const scenario = await ops.captureScenario({
        behavior: 'API returns 200 for errors',
        context: 'observed on POST /orders'
      })

      expect(scenario.stage).toBe('captured')
      expect(scenario.mode).toBe('observed')
      expect(scenario.behavior).toBe('API returns 200 for errors')

      const scenarios = await ops.getScenarios()
      expect(scenarios).toHaveLength(1)
    })

    it('defaults to observed mode when mode is omitted', async () => {
      const scenario = await ops.captureScenario({
        behavior: 'API returns 200 for errors'
      })

      expect(scenario.mode).toBe('observed')
    })

    it('creates a captured scenario with intended mode and story', async () => {
      const scenario = await ops.captureScenario({
        behavior: 'Users can cancel pending orders',
        story: 'Cancel Order',
        mode: 'intended'
      })

      expect(scenario.stage).toBe('captured')
      expect(scenario.mode).toBe('intended')
      expect(scenario.story).toBe('Cancel Order')
    })
  })

  describe('advanceScenario', () => {
    it('advances captured to characterized with rationale', async () => {
      const scenario = await ops.captureScenario({ behavior: 'returns 200 for errors' })
      const advanced = await ops.advanceScenario(scenario.id, {
        rationale: 'API predates REST conventions',
        promotedBy: 'dev'
      })

      expect(advanced.stage).toBe('characterized')
      expect(advanced.promotedFrom).toBe('captured')
      expect(advanced.promotedBy).toBe('dev')
    })

    it('advances characterized to mapped', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await ops.advanceScenario(scenario.id, { rationale: 'characterized', promotedBy: 'dev' })
      const advanced = await ops.advanceScenario(scenario.id, { rationale: 'confirmed', promotedBy: 'business' })
      expect(advanced.stage).toBe('mapped')
    })

    it('advances mapped to specified', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await ops.advanceScenario(scenario.id, { rationale: 'characterized', promotedBy: 'dev' })
      await ops.advanceScenario(scenario.id, { rationale: 'mapped', promotedBy: 'business' })
      const advanced = await ops.advanceScenario(scenario.id, { rationale: 'examples complete', promotedBy: 'testing' })
      expect(advanced.stage).toBe('specified')
    })

    it('advances specified to implemented', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await ops.advanceScenario(scenario.id, { rationale: 'characterized', promotedBy: 'dev' })
      await ops.advanceScenario(scenario.id, { rationale: 'mapped', promotedBy: 'business' })
      await ops.advanceScenario(scenario.id, { rationale: 'specified', promotedBy: 'testing' })
      const advanced = await ops.advanceScenario(scenario.id, { rationale: 'tests written', promotedBy: 'testing' })
      expect(advanced.stage).toBe('implemented')
    })

    it('throws on invalid advancement (already implemented)', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await ops.advanceScenario(scenario.id, { rationale: 'a', promotedBy: 'dev' })
      await ops.advanceScenario(scenario.id, { rationale: 'b', promotedBy: 'dev' })
      await ops.advanceScenario(scenario.id, { rationale: 'c', promotedBy: 'dev' })
      await ops.advanceScenario(scenario.id, { rationale: 'd', promotedBy: 'dev' })
      await expect(ops.advanceScenario(scenario.id, { rationale: 'again', promotedBy: 'testing' }))
        .rejects.toThrow('Cannot advance beyond implemented')
    })

    it('throws for unknown scenario', async () => {
      await expect(ops.advanceScenario('nonexistent', { rationale: 'x', promotedBy: 'dev' }))
        .rejects.toThrow('Scenario not found')
    })
  })

  describe('regressScenario', () => {
    it('regresses implemented back to characterized', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await ops.advanceScenario(scenario.id, { rationale: 'a', promotedBy: 'dev' })
      await ops.advanceScenario(scenario.id, { rationale: 'b', promotedBy: 'dev' })
      await ops.advanceScenario(scenario.id, { rationale: 'c', promotedBy: 'dev' })
      await ops.advanceScenario(scenario.id, { rationale: 'd', promotedBy: 'dev' })
      const regressed = await ops.regressScenario(scenario.id, {
        targetStage: 'characterized',
        rationale: 'test started failing after system change'
      })

      expect(regressed.stage).toBe('characterized')
    })

    it('throws when regressing to a later stage', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await expect(ops.regressScenario(scenario.id, { targetStage: 'mapped', rationale: 'x' }))
        .rejects.toThrow('Cannot regress to a later stage')
    })

    it('persists the rationale on the scenario', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await ops.advanceScenario(scenario.id, { rationale: 'a', promotedBy: 'dev' })
      await ops.advanceScenario(scenario.id, { rationale: 'b', promotedBy: 'dev' })

      await ops.regressScenario(scenario.id, {
        targetStage: 'captured',
        rationale: 'needs re-investigation'
      })

      const updated = await ops.getScenario(scenario.id)
      expect(updated!.stage).toBe('captured')
      expect(updated!.promotedFrom).toBe('mapped')
      expect(updated!.regressionRationale).toBe('needs re-investigation')
    })
  })

  describe('addQuestion / resolveQuestion', () => {
    it('adds and resolves a question on a scenario', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      const question = await ops.addQuestion(scenario.id, 'What happens with null input?')

      const updated = await ops.getScenario(scenario.id)
      expect(updated!.questions).toHaveLength(1)
      expect(updated!.questions[0].text).toBe('What happens with null input?')
      expect(updated!.questions[0].answer).toBeUndefined()

      await ops.resolveQuestion(scenario.id, question.id, 'It throws a 400 error')
      const resolved = await ops.getScenario(scenario.id)
      expect(resolved!.questions[0].answer).toBe('It throws a 400 error')
    })
  })

  describe('getScenarios — filtering', () => {
    it('filters by stage', async () => {
      await ops.captureScenario({ behavior: 'a' })
      await ops.captureScenario({ behavior: 'b' })
      await ops.captureScenario({ behavior: 'c', mode: 'intended' })

      expect(await ops.getScenarios({ stage: 'captured' })).toHaveLength(3)
    })

    it('filters by story', async () => {
      await ops.captureScenario({ behavior: 'a', story: 'Cancel Order', mode: 'intended' })
      await ops.captureScenario({ behavior: 'b', story: 'Create Order', mode: 'intended' })

      expect(await ops.getScenarios({ story: 'Cancel Order' })).toHaveLength(1)
    })

    it('filters by keyword in behavior', async () => {
      await ops.captureScenario({ behavior: 'API returns 200 for errors' })
      await ops.captureScenario({ behavior: 'Database uses soft delete' })

      expect(await ops.getScenarios({ keyword: 'error' })).toHaveLength(1)
    })
  })

  describe('linkToDomain', () => {
    it('links a scenario to domain artifacts', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await ops.advanceScenario(scenario.id, { rationale: 'a', promotedBy: 'dev' })
      await ops.advanceScenario(scenario.id, { rationale: 'b', promotedBy: 'dev' })
      await ops.advanceScenario(scenario.id, { rationale: 'c', promotedBy: 'dev' })
      await ops.advanceScenario(scenario.id, { rationale: 'd', promotedBy: 'dev' })

      await ops.linkToDomain(scenario.id, {
        domainOperation: 'action.cancelOrder',
        testNames: ['cancels pending order [unit]', 'cancels pending order [http]']
      })

      const linked = await ops.getScenario(scenario.id)
      expect(linked!.domainOperation).toBe('action.cancelOrder')
      expect(linked!.testNames).toEqual(['cancels pending order [unit]', 'cancels pending order [http]'])
    })
  })

  describe('getScenarioSummary', () => {
    it('returns counts per stage and open questions', async () => {
      await ops.captureScenario({ behavior: 'a' })
      await ops.captureScenario({ behavior: 'b' })
      await ops.captureScenario({ behavior: 'c', mode: 'intended' })
      const scenario = await ops.captureScenario({ behavior: 'd' })
      await ops.addQuestion(scenario.id, 'why?')

      const summary = await ops.getScenarioSummary()
      expect(summary.captured).toBe(4)
      expect(summary.openQuestions).toBe(1)
      expect(summary.total).toBe(4)
    })
  })

  describe('getAdvanceCandidates', () => {
    it('returns characterized scenarios with no open questions', async () => {
      const a = await ops.captureScenario({ behavior: 'a' })
      await ops.advanceScenario(a.id, { rationale: 'characterized', promotedBy: 'dev' })

      const b = await ops.captureScenario({ behavior: 'b' })
      await ops.advanceScenario(b.id, { rationale: 'characterized', promotedBy: 'dev' })
      await ops.addQuestion(b.id, 'unresolved question')

      const candidates = await ops.getAdvanceCandidates()
      expect(candidates).toHaveLength(1)
      expect(candidates[0].id).toBe(a.id)
    })
  })

  describe('concurrency', () => {
    it('serializes concurrent captureScenario calls', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        ops.captureScenario({ behavior: `concurrent-${i}` })
      )
      const results = await Promise.all(promises)

      const all = await ops.getScenarios()
      expect(all).toHaveLength(5)
      // Each capture should have produced a unique scenario
      const ids = new Set(results.map(s => s.id))
      expect(ids.size).toBe(5)
    })
  })
})
