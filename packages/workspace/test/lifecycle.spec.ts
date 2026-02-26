import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { WorkspaceOps, WorkspaceStore, detectPhase, exportMarkdown } from '../src/index'
import type { Stage } from '../src/index'

describe('full lifecycle: captured -> characterized -> mapped -> specified -> implemented', () => {
  let dir: string
  let ops: WorkspaceOps
  let store: WorkspaceStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aver-workspace-'))
    store = new WorkspaceStore(dir, 'lifecycle-test')
    ops = new WorkspaceOps(store)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  /** Helper: advance a scenario through stages with required prerequisites */
  async function advanceToStage(id: string, targetStage: Stage) {
    const stages: Stage[] = ['captured', 'characterized', 'mapped', 'specified', 'implemented']
    const scenario = await ops.getScenario(id)
    if (!scenario) throw new Error('Scenario not found')
    const currentIdx = stages.indexOf(scenario.stage)
    const targetIdx = stages.indexOf(targetStage)

    for (let i = currentIdx; i < targetIdx; i++) {
      const from = stages[i]
      const to = stages[i + 1]
      if (from === 'characterized' && to === 'mapped') {
        await ops.confirmScenario(id, 'business')
      }
      if (from === 'specified' && to === 'implemented') {
        await ops.linkToDomain(id, { domainOperation: 'test.op' })
      }
      await ops.advanceScenario(id, { rationale: `advance to ${to}`, promotedBy: 'dev' })
    }
  }

  it('progresses scenarios through the full pipeline', async () => {
    // Phase: Kickoff
    expect(detectPhase(await store.load()).name).toBe('kickoff')

    // Phase: Investigation -- capture scenarios
    const obs1 = await ops.captureScenario({
      behavior: 'POST /orders with empty cart returns 200 with error field',
      context: 'observed via curl'
    })
    const obs2 = await ops.captureScenario({
      behavior: 'DELETE /orders/123 sets status to archived',
      context: 'observed via curl'
    })
    expect(detectPhase(await store.load()).name).toBe('investigation')

    // Dev characterizes -- add question, advance to characterized
    await ops.addQuestion(obs1.id, 'Why 200 instead of 400?')
    await ops.advanceScenario(obs1.id, { rationale: 'API predates REST conventions', promotedBy: 'dev' })
    // obs2 is still captured, so earliest-unfinished-stage drives the phase
    expect(detectPhase(await store.load()).name).toBe('investigation')

    // Resolve question, business confirms via mapping
    const question = (await ops.getScenario(obs1.id))!.questions[0]
    await ops.resolveQuestion(obs1.id, question.id, 'Legacy API, keep for backward compat')

    // Set confirmedBy before advancing to mapped
    await ops.confirmScenario(obs1.id, 'business-user')
    await ops.advanceScenario(obs1.id, {
      rationale: 'Business confirms: keep 200+error for v1 endpoints',
      promotedBy: 'business'
    })

    // Advance to specified
    await ops.advanceScenario(obs1.id, {
      rationale: 'Examples complete, domain vocabulary defined',
      promotedBy: 'testing'
    })

    // Link domain before advancing to implemented
    await ops.linkToDomain(obs1.id, {
      domainOperation: 'assertion.legacyErrorResponse',
      testNames: ['legacy error returns 200 [unit]', 'legacy error returns 200 [http]']
    })

    // Advance to implemented
    await ops.advanceScenario(obs1.id, {
      rationale: 'Tests written and passing',
      promotedBy: 'testing'
    })

    // Check final state
    const scenario = (await ops.getScenario(obs1.id))!
    expect(scenario.stage).toBe('implemented')
    expect(scenario.domainOperation).toBe('assertion.legacyErrorResponse')
    expect(scenario.transitions).toHaveLength(4) // captured->char->mapped->specified->impl

    // Verify summary
    const summary = await ops.getScenarioSummary()
    expect(summary.implemented).toBe(1)
    expect(summary.captured).toBe(1) // obs2 still captured
    expect(summary.openQuestions).toBe(0)

    // Export produces readable markdown
    const md = exportMarkdown(await store.load())
    expect(md).toContain('POST /orders with empty cart returns 200 with error field')
    expect(md).toContain('assertion.legacyErrorResponse')
  })

  it('handles revisit when an implemented scenario needs rework', async () => {
    const scenario = await ops.captureScenario({ behavior: 'users can cancel orders', mode: 'intended' })
    await advanceToStage(scenario.id, 'implemented')
    expect((await ops.getScenario(scenario.id))!.stage).toBe('implemented')

    // System change breaks the test -- revisit
    await ops.revisitScenario(scenario.id, {
      targetStage: 'characterized',
      rationale: 'cancellation test failing after payment API change'
    })
    expect((await ops.getScenario(scenario.id))!.stage).toBe('characterized')

    // Re-investigate and re-advance
    await ops.confirmScenario(scenario.id, 'business')
    await ops.advanceScenario(scenario.id, { rationale: 'understood new payment flow', promotedBy: 'business' })
    await ops.advanceScenario(scenario.id, { rationale: 'examples updated', promotedBy: 'testing' })
    await ops.linkToDomain(scenario.id, { domainOperation: 'action.cancelOrder' })
    await ops.advanceScenario(scenario.id, { rationale: 'tests re-written', promotedBy: 'testing' })
    expect((await ops.getScenario(scenario.id))!.stage).toBe('implemented')

    // Transitions should record the full history
    const updated = (await ops.getScenario(scenario.id))!
    expect(updated.transitions.length).toBeGreaterThanOrEqual(8)
  })
})
