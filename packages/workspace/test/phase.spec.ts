import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { WorkspaceOps } from '../src/operations'
import { WorkspaceStore } from '../src/storage'
import { detectPhase } from '../src/phase'

describe('detectPhase', () => {
  let dir: string
  let ops: WorkspaceOps
  let store: WorkspaceStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aver-workspace-'))
    store = new WorkspaceStore(dir, 'test-project')
    ops = new WorkspaceOps(store)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns kickoff when workspace is empty', () => {
    const phase = detectPhase(store.load())
    expect(phase.name).toBe('kickoff')
    expect(phase.description).toContain('new workflow')
  })

  it('returns discovery when mostly observed', () => {
    ops.recordObservation({ behavior: 'a' })
    ops.recordObservation({ behavior: 'b' })
    ops.recordObservation({ behavior: 'c' })

    const phase = detectPhase(store.load())
    expect(phase.name).toBe('discovery')
  })

  it('returns mapping when items are explored', () => {
    const item = ops.recordObservation({ behavior: 'a' })
    ops.promoteItem(item.id, { rationale: 'explored', promotedBy: 'dev' })

    const phase = detectPhase(store.load())
    expect(phase.name).toBe('mapping')
  })

  it('returns formalization when items are intended', () => {
    const item = ops.recordIntent({ behavior: 'a' })

    const phase = detectPhase(store.load())
    expect(phase.name).toBe('formalization')
  })

  it('returns implementation when formalized items exist without domain links', () => {
    const item = ops.recordIntent({ behavior: 'a' })
    ops.promoteItem(item.id, { rationale: 'done', promotedBy: 'testing' })

    const phase = detectPhase(store.load())
    expect(phase.name).toBe('implementation')
  })

  it('returns verification when all formalized items have domain links', () => {
    const item = ops.recordIntent({ behavior: 'a' })
    ops.promoteItem(item.id, { rationale: 'done', promotedBy: 'testing' })
    ops.linkToDomain(item.id, { domainOperation: 'action.doA', testNames: ['test a'] })

    const phase = detectPhase(store.load())
    expect(phase.name).toBe('verification')
  })

  it('includes recommended actions', () => {
    ops.recordObservation({ behavior: 'a' })
    const phase = detectPhase(store.load())
    expect(phase.recommendedActions.length).toBeGreaterThan(0)
  })
})
