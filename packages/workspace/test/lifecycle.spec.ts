import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { WorkspaceOps, WorkspaceStore, detectPhase, exportMarkdown } from '../src/index'

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

  it('progresses scenarios through the full pipeline', () => {
    // Phase: Kickoff
    expect(detectPhase(store.load()).name).toBe('kickoff')

    // Phase: Investigation -- capture scenarios
    const obs1 = ops.captureScenario({
      behavior: 'POST /orders with empty cart returns 200 with error field',
      context: 'observed via curl'
    })
    const obs2 = ops.captureScenario({
      behavior: 'DELETE /orders/123 sets status to archived',
      context: 'observed via curl'
    })
    expect(detectPhase(store.load()).name).toBe('investigation')

    // Dev characterizes -- add question, advance to characterized
    ops.addQuestion(obs1.id, 'Why 200 instead of 400?')
    ops.advanceScenario(obs1.id, { rationale: 'API predates REST conventions', promotedBy: 'dev' })
    expect(detectPhase(store.load()).name).toBe('mapping')

    // Resolve question, business confirms via mapping
    const question = ops.getScenario(obs1.id)!.questions[0]
    ops.resolveQuestion(obs1.id, question.id, 'Legacy API, keep for backward compat')
    ops.advanceScenario(obs1.id, {
      rationale: 'Business confirms: keep 200+error for v1 endpoints',
      promotedBy: 'business'
    })

    // Advance to specified
    ops.advanceScenario(obs1.id, {
      rationale: 'Examples complete, domain vocabulary defined',
      promotedBy: 'testing'
    })

    // Advance to implemented
    ops.advanceScenario(obs1.id, {
      rationale: 'Tests written and passing',
      promotedBy: 'testing'
    })
    ops.linkToDomain(obs1.id, {
      domainOperation: 'assertion.legacyErrorResponse',
      testNames: ['legacy error returns 200 [unit]', 'legacy error returns 200 [http]']
    })

    // Check final state
    const scenario = ops.getScenario(obs1.id)!
    expect(scenario.stage).toBe('implemented')
    expect(scenario.domainOperation).toBe('assertion.legacyErrorResponse')
    expect(scenario.humanConfirmed).toBeUndefined() // we didn't set this in this test

    // Verify summary
    const summary = ops.getScenarioSummary()
    expect(summary.implemented).toBe(1)
    expect(summary.captured).toBe(1) // obs2 still captured
    expect(summary.openQuestions).toBe(0)

    // Export produces readable markdown
    const md = exportMarkdown(store.load())
    expect(md).toContain('POST /orders with empty cart returns 200 with error field')
    expect(md).toContain('assertion.legacyErrorResponse')
  })

  it('handles regression when an implemented scenario regresses', () => {
    const scenario = ops.captureScenario({ behavior: 'users can cancel orders', mode: 'intended' })
    ops.advanceScenario(scenario.id, { rationale: 'a', promotedBy: 'dev' })
    ops.advanceScenario(scenario.id, { rationale: 'b', promotedBy: 'dev' })
    ops.advanceScenario(scenario.id, { rationale: 'c', promotedBy: 'dev' })
    ops.advanceScenario(scenario.id, { rationale: 'tests written', promotedBy: 'testing' })
    expect(ops.getScenario(scenario.id)!.stage).toBe('implemented')

    // System change breaks the test -- regress
    ops.regressScenario(scenario.id, {
      targetStage: 'characterized',
      rationale: 'cancellation test failing after payment API change'
    })
    expect(ops.getScenario(scenario.id)!.stage).toBe('characterized')

    // Re-investigate and re-advance
    ops.advanceScenario(scenario.id, { rationale: 'understood new payment flow', promotedBy: 'business' })
    ops.advanceScenario(scenario.id, { rationale: 'examples updated', promotedBy: 'testing' })
    ops.advanceScenario(scenario.id, { rationale: 'tests re-written', promotedBy: 'testing' })
    expect(ops.getScenario(scenario.id)!.stage).toBe('implemented')
  })
})
