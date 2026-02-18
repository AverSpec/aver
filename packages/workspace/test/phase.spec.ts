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

  it('returns investigation when scenarios are captured', () => {
    ops.captureScenario({ behavior: 'a' })
    ops.captureScenario({ behavior: 'b' })
    ops.captureScenario({ behavior: 'c' })

    const phase = detectPhase(store.load())
    expect(phase.name).toBe('investigation')
  })

  it('returns mapping when scenarios are characterized', () => {
    const scenario = ops.captureScenario({ behavior: 'a' })
    ops.advanceScenario(scenario.id, { rationale: 'characterized', promotedBy: 'dev' })

    const phase = detectPhase(store.load())
    expect(phase.name).toBe('mapping')
  })

  it('returns specification when scenarios are mapped', () => {
    const scenario = ops.captureScenario({ behavior: 'a' })
    ops.advanceScenario(scenario.id, { rationale: 'characterized', promotedBy: 'dev' })
    ops.advanceScenario(scenario.id, { rationale: 'mapped', promotedBy: 'business' })

    const phase = detectPhase(store.load())
    expect(phase.name).toBe('specification')
  })

  it('returns implementation when specified scenarios exist without domain links', () => {
    const scenario = ops.captureScenario({ behavior: 'a' })
    ops.advanceScenario(scenario.id, { rationale: 'a', promotedBy: 'dev' })
    ops.advanceScenario(scenario.id, { rationale: 'b', promotedBy: 'dev' })
    ops.advanceScenario(scenario.id, { rationale: 'c', promotedBy: 'dev' })

    const phase = detectPhase(store.load())
    expect(phase.name).toBe('implementation')
  })

  it('returns implementation when implemented scenarios exist without domain links', () => {
    const scenario = ops.captureScenario({ behavior: 'a' })
    ops.advanceScenario(scenario.id, { rationale: 'a', promotedBy: 'dev' })
    ops.advanceScenario(scenario.id, { rationale: 'b', promotedBy: 'dev' })
    ops.advanceScenario(scenario.id, { rationale: 'c', promotedBy: 'dev' })
    ops.advanceScenario(scenario.id, { rationale: 'd', promotedBy: 'dev' })

    const phase = detectPhase(store.load())
    expect(phase.name).toBe('implementation')
  })

  it('returns verification when all implemented scenarios have domain links', () => {
    const scenario = ops.captureScenario({ behavior: 'a' })
    ops.advanceScenario(scenario.id, { rationale: 'a', promotedBy: 'dev' })
    ops.advanceScenario(scenario.id, { rationale: 'b', promotedBy: 'dev' })
    ops.advanceScenario(scenario.id, { rationale: 'c', promotedBy: 'dev' })
    ops.advanceScenario(scenario.id, { rationale: 'd', promotedBy: 'dev' })
    ops.linkToDomain(scenario.id, { domainOperation: 'action.doA', testNames: ['test a'] })

    const phase = detectPhase(store.load())
    expect(phase.name).toBe('verification')
  })

  it('includes recommended actions', () => {
    ops.captureScenario({ behavior: 'a' })
    const phase = detectPhase(store.load())
    expect(phase.recommendedActions.length).toBeGreaterThan(0)
  })

  it('uses scenario terminology in recommended actions', () => {
    ops.captureScenario({ behavior: 'a' })
    const phase = detectPhase(store.load())
    // Should not contain "item" in recommended actions
    for (const action of phase.recommendedActions) {
      expect(action.toLowerCase()).not.toContain('item')
    }
  })
})
