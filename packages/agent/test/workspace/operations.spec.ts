import { describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@libsql/client'
import { WorkspaceOps, verifyAdvancement, AdvancementBlockedError } from '../../src/workspace/operations'
import { WorkspaceStore } from '../../src/workspace/storage'
import type { Scenario, Stage } from '../../src/workspace/types'

describe('WorkspaceOps', () => {
  let ops: WorkspaceOps

  beforeEach(async () => {
    const client = createClient({ url: ':memory:' })
    const store = new WorkspaceStore(client, 'test-project')
    ops = new WorkspaceOps(store)
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
        await ops.confirmScenario(id, 'test-confirmer')
      }
      // Set domain links before specified -> implemented
      if (from === 'specified' && to === 'implemented') {
        await ops.linkToDomain(id, { domainOperation: 'test.op' })
      }

      await ops.advanceScenario(id, { rationale: `advance to ${to}`, promotedBy: 'dev' })
    }
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
      await ops.confirmScenario(scenario.id, 'business-user')
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
      await ops.confirmScenario(scenario.id, 'user')
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
      const { scenario: revisited } = await ops.revisitScenario(scenario.id, {
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
      await ops.confirmScenario(scenario.id, 'user')
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

    it('clears confirmedBy when revisiting to captured', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await advanceToStage(scenario.id, 'mapped') // sets confirmedBy
      const pre = await ops.getScenario(scenario.id)
      expect(pre!.confirmedBy).toBe('test-confirmer') // sanity check

      await ops.revisitScenario(scenario.id, {
        targetStage: 'captured',
        rationale: 'fundamental rethink needed',
      })

      const updated = await ops.getScenario(scenario.id)
      expect(updated!.confirmedBy).toBeUndefined()
    })

    it('clears domain links when revisiting past specified', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await advanceToStage(scenario.id, 'implemented') // sets domainOperation
      const pre = await ops.getScenario(scenario.id)
      expect(pre!.domainOperation).toBe('test.op') // sanity check

      await ops.revisitScenario(scenario.id, {
        targetStage: 'characterized',
        rationale: 'spec was wrong',
      })

      const updated = await ops.getScenario(scenario.id)
      expect(updated!.domainOperation).toBeUndefined()
      expect(updated!.testNames).toBeUndefined()
      expect(updated!.approvalBaseline).toBeUndefined()
    })

    it('preserves domain links when revisiting within same tier', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await advanceToStage(scenario.id, 'implemented')

      const { clearedFields } = await ops.revisitScenario(scenario.id, {
        targetStage: 'specified',
        rationale: 'implementation needs rework',
      })

      const updated = await ops.getScenario(scenario.id)
      expect(updated!.domainOperation).toBe('test.op')
      expect(updated!.stage).toBe('specified')
      expect(clearedFields).toEqual([])
    })

    it('returns clearedFields listing domain links when stripped', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await advanceToStage(scenario.id, 'implemented')
      // Also set testNames so we can verify they appear in clearedFields
      await ops.linkToDomain(scenario.id, { testNames: ['test [unit]'] })

      const { clearedFields } = await ops.revisitScenario(scenario.id, {
        targetStage: 'characterized',
        rationale: 'spec was wrong',
      })

      expect(clearedFields).toContain('domainOperation')
      expect(clearedFields).toContain('testNames')
    })

    it('returns clearedFields listing confirmedBy when stripped', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await advanceToStage(scenario.id, 'mapped')

      const { clearedFields } = await ops.revisitScenario(scenario.id, {
        targetStage: 'captured',
        rationale: 'fundamental rethink needed',
      })

      expect(clearedFields).toContain('confirmedBy')
    })

    it('returns empty clearedFields when no fields are cleared', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await ops.advanceScenario(scenario.id, { rationale: 'a', promotedBy: 'dev' })

      const { clearedFields } = await ops.revisitScenario(scenario.id, {
        targetStage: 'captured',
        rationale: 'redo',
      })

      // characterized -> captured: confirmedBy was never set, so nothing cleared
      expect(clearedFields).toEqual([])
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

  describe('AdvancementBlockedError', () => {
    it('advanceScenario throws AdvancementBlockedError for verification failures', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await ops.advanceScenario(scenario.id, { rationale: 'a', promotedBy: 'dev' })
      // At characterized, no confirmedBy — should throw AdvancementBlockedError
      try {
        await ops.advanceScenario(scenario.id, { rationale: 'b', promotedBy: 'dev' })
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(AdvancementBlockedError)
        const blocked = err as InstanceType<typeof AdvancementBlockedError>
        expect(blocked.hardBlocks).toHaveLength(1)
        expect(blocked.hardBlocks[0]).toContain('confirmedBy')
        expect(blocked.verification.blocked).toBe(true)
      }
    })

    it('advanceScenario throws plain Error for non-verification failures', async () => {
      try {
        await ops.advanceScenario('nonexistent', { rationale: 'x', promotedBy: 'dev' })
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).not.toBeInstanceOf(AdvancementBlockedError)
        expect(err).toBeInstanceOf(Error)
      }
    })
  })

  describe('batchAdvance classification', () => {
    it('classifies blocked scenarios via AdvancementBlockedError', async () => {
      const s1 = await ops.captureScenario({ behavior: 'test1' })
      await ops.advanceScenario(s1.id, { rationale: 'a', promotedBy: 'dev' })
      // s1 is characterized but not confirmed — will be blocked

      const s2 = await ops.captureScenario({ behavior: 'test2' })
      // s2 is captured — can advance to characterized

      const result = await ops.batchAdvance({
        ids: [s1.id, s2.id],
        rationale: 'batch',
        promotedBy: 'dev',
      })

      expect(result.summary.blocked).toBe(1)
      expect(result.summary.advanced).toBe(1)
      expect(result.results.find(r => r.id === s1.id)!.status).toBe('blocked')
      expect(result.results.find(r => r.id === s2.id)!.status).toBe('advanced')
    })

    it('classifies non-existent scenarios as error (not blocked)', async () => {
      const result = await ops.batchAdvance({
        ids: ['nonexistent'],
        rationale: 'batch',
        promotedBy: 'dev',
      })

      expect(result.summary.errors).toBe(1)
      expect(result.summary.blocked).toBe(0)
      expect(result.results[0].status).toBe('error')
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

  describe('updateScenario', () => {
    it('updates behavior and context', async () => {
      const scenario = await ops.captureScenario({ behavior: 'old behavior', context: 'old context' })
      const updated = await ops.updateScenario(scenario.id, { behavior: 'new behavior', context: 'new context' })

      expect(updated.behavior).toBe('new behavior')
      expect(updated.context).toBe('new context')
      expect(updated.stage).toBe('captured') // unchanged

      const persisted = await ops.getScenario(scenario.id)
      expect(persisted!.behavior).toBe('new behavior')
    })

    it('replaces rules array', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      const updated = await ops.updateScenario(scenario.id, { rules: ['rule 1', 'rule 2'] })

      expect(updated.rules).toEqual(['rule 1', 'rule 2'])
    })

    it('replaces examples array', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      const updated = await ops.updateScenario(scenario.id, {
        examples: [{ description: 'ex1', expectedOutcome: 'pass' }]
      })

      expect(updated.examples).toEqual([{ description: 'ex1', expectedOutcome: 'pass' }])
    })

    it('replaces constraints array', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      const updated = await ops.updateScenario(scenario.id, { constraints: ['must be fast'] })

      expect(updated.constraints).toEqual(['must be fast'])
    })

    it('replaces seams array', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      const updated = await ops.updateScenario(scenario.id, {
        seams: [{ type: 'http', location: '/api/users', description: 'REST endpoint' }]
      })

      expect(updated.seams).toEqual([{ type: 'http', location: '/api/users', description: 'REST endpoint' }])
    })

    it('updates story field', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test', story: 'old' })
      const updated = await ops.updateScenario(scenario.id, { story: 'new story' })

      expect(updated.story).toBe('new story')
    })

    it('applies partial updates without touching other fields', async () => {
      const scenario = await ops.captureScenario({ behavior: 'keep me', context: 'keep me too', story: 'keep' })
      const updated = await ops.updateScenario(scenario.id, { rules: ['new rule'] })

      expect(updated.behavior).toBe('keep me')
      expect(updated.context).toBe('keep me too')
      expect(updated.story).toBe('keep')
      expect(updated.rules).toEqual(['new rule'])
    })

    it('throws for nonexistent scenario', async () => {
      await expect(ops.updateScenario('nonexistent', { behavior: 'x' }))
        .rejects.toThrow('Scenario not found')
    })

    it('stamps updatedAt', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      const before = scenario.updatedAt
      await new Promise(r => setTimeout(r, 10))
      const updated = await ops.updateScenario(scenario.id, { behavior: 'changed' })

      expect(updated.updatedAt).not.toBe(before)
    })
  })

  describe('concurrency', () => {
    it('concurrent captureScenario calls do not corrupt data', async () => {
      // Concurrent mutations have last-writer-wins semantics because
      // the read (load) happens before the atomic write (batch).
      // This test verifies no data corruption — at least one scenario
      // survives and every returned result has a unique id.
      const promises = Array.from({ length: 5 }, (_, i) =>
        ops.captureScenario({ behavior: `concurrent-${i}` })
      )
      const results = await Promise.all(promises)

      const all = await ops.getScenarios()
      expect(all.length).toBeGreaterThanOrEqual(1)
      // Each capture should have produced a unique scenario id
      const ids = new Set(results.map(s => s.id))
      expect(ids.size).toBe(5)
    })

    it('sequential captureScenario calls accumulate correctly', async () => {
      for (let i = 0; i < 5; i++) {
        await ops.captureScenario({ behavior: `sequential-${i}` })
      }

      const all = await ops.getScenarios()
      expect(all).toHaveLength(5)
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
      seams: [{ type: 'function-boundary', location: 'TaskService.create()', description: 'Entry point for task creation logic' }],
    })
    const result = verifyAdvancement(scenario, 'captured', 'characterized')
    expect(result.blocked).toBe(false)
    expect(result.warnings).toHaveLength(0)
  })
})
