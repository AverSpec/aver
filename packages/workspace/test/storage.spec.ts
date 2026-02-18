import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { WorkspaceStore } from '../src/storage'
import { createScenario } from '../src/types'

describe('WorkspaceStore', () => {
  let dir: string
  let store: WorkspaceStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aver-workspace-'))
    store = new WorkspaceStore(dir, 'test-project')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates workspace on first access', () => {
    const ws = store.load()
    expect(ws.projectId).toBe('test-project')
    expect(ws.scenarios).toEqual([])
  })

  it('persists scenarios across load/save cycles', () => {
    const ws = store.load()
    const scenario = createScenario({ stage: 'captured', behavior: 'test behavior' })
    ws.scenarios.push(scenario)
    store.save(ws)

    const reloaded = store.load()
    expect(reloaded.scenarios).toHaveLength(1)
    expect(reloaded.scenarios[0].behavior).toBe('test behavior')
  })

  it('uses project-specific subdirectory', () => {
    store.save(store.load())
    const storePath = store.filePath
    expect(storePath).toContain('test-project')
  })

  it('resolves default path to ~/.aver/workspaces/', () => {
    const defaultStore = WorkspaceStore.withDefaults('my-project')
    expect(defaultStore.filePath).toContain('.aver')
    expect(defaultStore.filePath).toContain('workspaces')
    expect(defaultStore.filePath).toContain('my-project')
  })

  it('migrates legacy items field to scenarios on load', () => {
    // Simulate a legacy workspace file with "items" instead of "scenarios"
    const ws = store.load()
    const scenario = createScenario({ stage: 'captured', behavior: 'legacy behavior' })
    // Write with the old "items" key
    const legacyData = {
      projectId: ws.projectId,
      items: [scenario],
      createdAt: ws.createdAt,
      updatedAt: ws.updatedAt
    }
    const { writeFileSync } = require('node:fs')
    writeFileSync(store.filePath, JSON.stringify(legacyData, null, 2))

    const reloaded = store.load()
    expect(reloaded.scenarios).toHaveLength(1)
    expect(reloaded.scenarios[0].behavior).toBe('legacy behavior')
    expect((reloaded as any).items).toBeUndefined()
  })
})
