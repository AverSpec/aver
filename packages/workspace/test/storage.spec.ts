import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { WorkspaceStore } from '../src/storage'
import { createItem } from '../src/types'

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
    expect(ws.items).toEqual([])
  })

  it('persists items across load/save cycles', () => {
    const ws = store.load()
    const item = createItem({ stage: 'observed', behavior: 'test behavior' })
    ws.items.push(item)
    store.save(ws)

    const reloaded = store.load()
    expect(reloaded.items).toHaveLength(1)
    expect(reloaded.items[0].behavior).toBe('test behavior')
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
})
