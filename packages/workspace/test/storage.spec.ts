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

  it('creates workspace on first access', async () => {
    const ws = await store.load()
    expect(ws.projectId).toBe('test-project')
    expect(ws.scenarios).toEqual([])
  })

  it('persists scenarios across mutate/load cycles', async () => {
    const scenario = createScenario({ stage: 'captured', behavior: 'test behavior' })
    await store.mutate(ws => {
      ws.scenarios.push(scenario)
      return ws
    })

    const reloaded = await store.load()
    expect(reloaded.scenarios).toHaveLength(1)
    expect(reloaded.scenarios[0].behavior).toBe('test behavior')
  })

  it('uses project-specific subdirectory', async () => {
    await store.mutate(ws => ws) // trigger file creation
    const storePath = store.filePath
    expect(storePath).toContain('test-project')
  })

  it('resolves default path to ~/.aver/workspaces/', () => {
    const defaultStore = WorkspaceStore.withDefaults('my-project')
    expect(defaultStore.filePath).toContain('.aver')
    expect(defaultStore.filePath).toContain('workspaces')
    expect(defaultStore.filePath).toContain('my-project')
  })

  it('serializes concurrent mutate calls', async () => {
    // Fire 10 concurrent mutations that each add a scenario
    const promises = Array.from({ length: 10 }, (_, i) =>
      store.mutate(ws => {
        ws.scenarios.push(createScenario({ stage: 'captured', behavior: `scenario-${i}` }))
        return ws
      })
    )
    await Promise.all(promises)

    const final = await store.load()
    expect(final.scenarios).toHaveLength(10)
  })
})
