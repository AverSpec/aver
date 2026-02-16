import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { WorkspaceOps, WorkspaceStore, detectPhase, exportMarkdown } from '../src/index'

describe('full lifecycle: observed → explored → intended → formalized', () => {
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

  it('progresses items through the full pipeline', () => {
    // Phase: Kickoff
    expect(detectPhase(store.load()).name).toBe('kickoff')

    // Phase: Discovery — record observations
    const obs1 = ops.recordObservation({
      behavior: 'POST /orders with empty cart returns 200 with error field',
      context: 'observed via curl'
    })
    const obs2 = ops.recordObservation({
      behavior: 'DELETE /orders/123 sets status to archived',
      context: 'observed via curl'
    })
    expect(detectPhase(store.load()).name).toBe('discovery')

    // Dev explores — add question, promote to explored
    ops.addQuestion(obs1.id, 'Why 200 instead of 400?')
    ops.promoteItem(obs1.id, { rationale: 'API predates REST conventions', promotedBy: 'dev' })
    expect(detectPhase(store.load()).name).toBe('mapping')

    // Resolve question, business confirms intent
    const question = ops.getItem(obs1.id)!.questions[0]
    ops.resolveQuestion(obs1.id, question.id, 'Legacy API, keep for backward compat')
    ops.promoteItem(obs1.id, {
      rationale: 'Business confirms: keep 200+error for v1 endpoints',
      promotedBy: 'business'
    })

    // Testing formalizes
    ops.promoteItem(obs1.id, {
      rationale: 'Examples complete, domain vocabulary defined',
      promotedBy: 'testing'
    })
    ops.linkToDomain(obs1.id, {
      domainOperation: 'assertion.legacyErrorResponse',
      testNames: ['legacy error returns 200 [unit]', 'legacy error returns 200 [http]']
    })

    // Check final state
    const item = ops.getItem(obs1.id)!
    expect(item.stage).toBe('formalized')
    expect(item.domainOperation).toBe('assertion.legacyErrorResponse')
    expect(item.humanConfirmed).toBeUndefined() // we didn't set this in this test

    // Verify summary
    const summary = ops.getSummary()
    expect(summary.formalized).toBe(1)
    expect(summary.observed).toBe(1) // obs2 still observed
    expect(summary.openQuestions).toBe(0)

    // Export produces readable markdown
    const md = exportMarkdown(store.load())
    expect(md).toContain('POST /orders with empty cart returns 200 with error field')
    expect(md).toContain('assertion.legacyErrorResponse')
  })

  it('handles demotion when a formalized item regresses', () => {
    const item = ops.recordIntent({ behavior: 'users can cancel orders' })
    ops.promoteItem(item.id, { rationale: 'tests written', promotedBy: 'testing' })
    expect(ops.getItem(item.id)!.stage).toBe('formalized')

    // System change breaks the test — demote
    ops.demoteItem(item.id, {
      targetStage: 'explored',
      rationale: 'cancellation test failing after payment API change'
    })
    expect(ops.getItem(item.id)!.stage).toBe('explored')

    // Re-investigate and re-promote
    ops.promoteItem(item.id, { rationale: 'understood new payment flow', promotedBy: 'business' })
    ops.promoteItem(item.id, { rationale: 'examples updated', promotedBy: 'testing' })
    expect(ops.getItem(item.id)!.stage).toBe('formalized')
  })
})
