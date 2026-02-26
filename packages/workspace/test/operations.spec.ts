import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { WorkspaceOps, verifyAdvancement } from '../src/operations'
import { WorkspaceStore } from '../src/storage'
import type { Scenario, Stage } from '../src/types'

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

  /** Helper: advance a scenario through stages, setting confirmedBy when needed */
  async function advanceToStage(id: string, targetStage: Stage) {
    const stages: Stage[] = ['captured', 'characterized', 'mapped', 'specified', 'implemented']
    const scenario = await ops.getScenario(id)
    if (!scenario) throw new Error('Scenario not found')
    const currentIdx = stages.indexOf(scenario.stage)
    const targetIdx = stages.indexOf(targetStage)

    for (let i = currentIdx; i < targetIdx; i++) {
      const from = stages[i]
      const to = stages[i + 1]

      // Set confirmedBy before characterized -> mapped
      if (from === 'characterized' && to === 'mapped') {
        await setConfirmedBy(id, 'test-confirmer')
      }
      // Set domain links before specified -> implemented
      if (from === 'specified' && to === 'implemented') {
        await ops.linkToDomain(id, { domainOperation: 'test.op' })
      }

      await ops.advanceScenario(id, { rationale: `advance to ${to}`, promotedBy: 'dev' })
    }
  }

  /** Helper: set confirmedBy field via store mutation */
  async function setConfirmedBy(id: string, confirmer: string) {
    const store = new WorkspaceStore(dir, 'test-project')
    await store.mutate(ws => {
      const s = ws.scenarios.find(s => s.id === id)
      if (s) s.confirmedBy = confirmer
      return ws
    })
  }

  describe('captureScenario', () => {
    it('creates a captured scenario with observed mode and persists it', async () => {
      const scenario = await ops.captureScenario({
        behavior: 'API returns 200 for errors',
        context: 'observed on POST /orders'
      })

      expect(scenario.stage).toBe('captured')
      expect(scenario.mode).toBe('observed')
      expect(scenario.behavior).toBe('API returns 200 for errors')
      expect(scenario.transitions).toEqual([])

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
      const { scenario: advanced } = await ops.advanceScenario(scenario.id, {
        rationale: 'API predates REST conventions',
        promotedBy: 'dev'
      })

      expect(advanced.stage).toBe('characterized')
      expect(advanced.promotedFrom).toBe('captured')
      expect(advanced.promotedBy).toBe('dev')
    })

    it('advances characterized to mapped when confirmedBy is set', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await ops.advanceScenario(scenario.id, { rationale: 'characterized', promotedBy: 'dev' })
      await setConfirmedBy(scenario.id, 'business-user')
      const { scenario: advanced } = await ops.advanceScenario(scenario.id, { rationale: 'confirmed', promotedBy: 'business' })
      expect(advanced.stage).toBe('mapped')
    })

    it('blocks characterized to mapped when confirmedBy is not set', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await ops.advanceScenario(scenario.id, { rationale: 'characterized', promotedBy: 'dev' })
      await expect(ops.advanceScenario(scenario.id, { rationale: 'not confirmed', promotedBy: 'dev' }))
        .rejects.toThrow('confirmedBy is required')
    })

    it('confirms a scenario via confirmScenario', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await ops.advanceScenario(scenario.id, { rationale: 'characterized', promotedBy: 'dev' })
      await ops.confirmScenario(scenario.id, 'business-user')
      const updated = await ops.getScenario(scenario.id)
      expect(updated!.confirmedBy).toBe('business-user')
    })

    it('throws when confirming a non-existent scenario', async () => {
      await expect(ops.confirmScenario('nonexistent', 'user')).rejects.toThrow('Scenario not found')
    })

    it('advances mapped to specified', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await advanceToStage(scenario.id, 'mapped')
      const { scenario: advanced } = await ops.advanceScenario(scenario.id, { rationale: 'examples complete', promotedBy: 'testing' })
      expect(advanced.stage).toBe('specified')
    })

    it('blocks mapped to specified with open questions', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await advanceToStage(scenario.id, 'mapped')
      await ops.addQuestion(scenario.id, 'What about edge cases?')
      await expect(ops.advanceScenario(scenario.id, { rationale: 'c', promotedBy: 'dev' }))
        .rejects.toThrow('open question')
    })

    it('advances specified to implemented with domain links', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await advanceToStage(scenario.id, 'specified')
      await ops.linkToDomain(scenario.id, { domainOperation: 'action.doSomething' })
      const { scenario: advanced } = await ops.advanceScenario(scenario.id, { rationale: 'tests written', promotedBy: 'testing' })
      expect(advanced.stage).toBe('implemented')
    })

    it('blocks specified to implemented without domain links', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await advanceToStage(scenario.id, 'specified')
      // Remove the domain link that advanceToStage set (it only sets it for specified->implemented)
      // Actually advanceToStage only went to specified, not implemented, so no link was set yet
      // But advanceToStage does set domainOperation before the specified->implemented transition
      // Since we only went to specified, no domainOperation was set. Let's verify.
      const s = await ops.getScenario(scenario.id)
      // advanceToStage helper sets domain link before specified->implemented, not before specified
      // Since we stopped at specified, no link was set
      expect(s!.domainOperation).toBeUndefined()
      await expect(ops.advanceScenario(scenario.id, { rationale: 'd', promotedBy: 'dev' }))
        .rejects.toThrow('no domain links')
    })

    it('throws on invalid advancement (already implemented)', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await advanceToStage(scenario.id, 'implemented')
      await expect(ops.advanceScenario(scenario.id, { rationale: 'again', promotedBy: 'testing' }))
        .rejects.toThrow('Cannot advance beyond implemented')
    })

    it('throws for unknown scenario', async () => {
      await expect(ops.advanceScenario('nonexistent', { rationale: 'x', promotedBy: 'dev' }))
        .rejects.toThrow('Scenario not found')
    })

    it('populates transitions array on advance', async () => {
      const scenario = await ops.captureScenario({ behavior: 'transition tracking' })
      await ops.advanceScenario(scenario.id, { rationale: 'investigated', promotedBy: 'dev' })

      const updated = await ops.getScenario(scenario.id)
      expect(updated!.transitions).toHaveLength(1)
      expect(updated!.transitions[0].from).toBe('captured')
      expect(updated!.transitions[0].to).toBe('characterized')
      expect(updated!.transitions[0].by).toBe('dev')
      expect(updated!.transitions[0].rationale).toBe('investigated')
      expect(updated!.transitions[0].at).toBeTruthy()
    })
  })

  describe('advancement warnings', () => {
    it('warns when advancing to mapped with no rules or examples', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await ops.advanceScenario(scenario.id, { rationale: 'a', promotedBy: 'dev' })
      await setConfirmedBy(scenario.id, 'user')
      // Now at characterized, advance to mapped
      const { warnings } = await ops.advanceScenario(scenario.id, { rationale: 'b', promotedBy: 'dev' })
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('no rules or examples')
    })

    it('returns no warnings when content is present', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test', mode: 'intended' })
      // captured -> characterized (no warnings for intended mode)
      const { warnings } = await ops.advanceScenario(scenario.id, { rationale: 'a', promotedBy: 'dev' })
      expect(warnings).toHaveLength(0)
    })
  })

  describe('revisitScenario', () => {
    it('revisits implemented back to characterized', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await advanceToStage(scenario.id, 'implemented')
      const revisited = await ops.revisitScenario(scenario.id, {
        targetStage: 'characterized',
        rationale: 'test started failing after system change'
      })

      expect(revisited.stage).toBe('characterized')
    })

    it('throws when revisiting to a later stage', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await expect(ops.revisitScenario(scenario.id, { targetStage: 'mapped', rationale: 'x' }))
        .rejects.toThrow('Cannot revisit to a later or same stage')
    })

    it('persists the rationale on the scenario', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await ops.advanceScenario(scenario.id, { rationale: 'a', promotedBy: 'dev' })
      await setConfirmedBy(scenario.id, 'user')
      await ops.advanceScenario(scenario.id, { rationale: 'b', promotedBy: 'dev' })

      await ops.revisitScenario(scenario.id, {
        targetStage: 'captured',
        rationale: 'needs re-investigation'
      })

      const updated = await ops.getScenario(scenario.id)
      expect(updated!.stage).toBe('captured')
      expect(updated!.promotedFrom).toBe('mapped')
      expect(updated!.revisitRationale).toBe('needs re-investigation')
    })

    it('populates transitions array on revisit', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await ops.advanceScenario(scenario.id, { rationale: 'a', promotedBy: 'dev' })
      await ops.revisitScenario(scenario.id, {
        targetStage: 'captured',
        rationale: 'needs re-investigation'
      })

      const updated = await ops.getScenario(scenario.id)
      expect(updated!.transitions).toHaveLength(2)
      expect(updated!.transitions[1].from).toBe('characterized')
      expect(updated!.transitions[1].to).toBe('captured')
      expect(updated!.transitions[1].rationale).toBe('needs re-investigation')
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
      await advanceToStage(scenario.id, 'implemented')

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

describe('verifyAdvancement', () => {
  function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
    return {
      id: 'sc-1',
      stage: 'captured',
      behavior: 'test behavior',
      rules: [],
      examples: [],
      questions: [],
      constraints: [],
      seams: [],
      transitions: [],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      ...overrides,
    }
  }

  it('blocks characterized->mapped when confirmedBy is not set', () => {
    const scenario = makeScenario({ stage: 'characterized' })
    const result = verifyAdvancement(scenario, 'characterized', 'mapped')
    expect(result.blocked).toBe(true)
    expect(result.hardBlocks[0]).toContain('confirmedBy')
  })

  it('allows characterized->mapped when confirmedBy is set', () => {
    const scenario = makeScenario({ stage: 'characterized', confirmedBy: 'human' })
    const result = verifyAdvancement(scenario, 'characterized', 'mapped')
    expect(result.blocked).toBe(false)
  })

  it('blocks mapped->specified when open questions exist', () => {
    const scenario = makeScenario({
      stage: 'mapped',
      questions: [{ id: 'q1', text: 'unanswered' }],
    })
    const result = verifyAdvancement(scenario, 'mapped', 'specified')
    expect(result.blocked).toBe(true)
    expect(result.hardBlocks[0]).toContain('open question')
  })

  it('allows mapped->specified when all questions resolved', () => {
    const scenario = makeScenario({
      stage: 'mapped',
      questions: [{ id: 'q1', text: 'answered', answer: 'yes', resolvedAt: '2026-01-01' }],
    })
    const result = verifyAdvancement(scenario, 'mapped', 'specified')
    expect(result.blocked).toBe(false)
  })

  it('blocks specified->implemented when no domain links', () => {
    const scenario = makeScenario({ stage: 'specified' })
    const result = verifyAdvancement(scenario, 'specified', 'implemented')
    expect(result.blocked).toBe(true)
    expect(result.hardBlocks[0]).toContain('domain links')
  })

  it('allows specified->implemented with domainOperation', () => {
    const scenario = makeScenario({ stage: 'specified', domainOperation: 'Cart.addItem' })
    const result = verifyAdvancement(scenario, 'specified', 'implemented')
    expect(result.blocked).toBe(false)
  })

  it('warns captured->characterized for observed mode with no evidence', () => {
    const scenario = makeScenario({ stage: 'captured', mode: 'observed' })
    const result = verifyAdvancement(scenario, 'captured', 'characterized')
    expect(result.blocked).toBe(false)
    expect(result.warnings[0]).toContain('no investigation')
  })

  it('no warning for captured->characterized with seams', () => {
    const scenario = makeScenario({
      stage: 'captured',
      mode: 'observed',
      seams: ['function boundary at TaskService.create()'],
    })
    const result = verifyAdvancement(scenario, 'captured', 'characterized')
    expect(result.blocked).toBe(false)
    expect(result.warnings).toHaveLength(0)
  })
})
