import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkspaceStore } from '../src/storage'

describe('schema versioning', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aver-schema-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('new workspaces get schemaVersion 1.0.0', async () => {
    const store = new WorkspaceStore(dir, 'test-project')
    const ws = await store.load()
    expect(ws.schemaVersion).toBe('1.0.0')
  })

  it('pre-versioned workspaces get migrated to 1.0.0', async () => {
    // Write a workspace file without schemaVersion
    const { writeFileSync, mkdirSync } = await import('node:fs')
    const projectDir = join(dir, 'legacy-project')
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(
      join(projectDir, 'workspace.json'),
      JSON.stringify({ projectId: 'legacy-project', scenarios: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' })
    )
    const store = new WorkspaceStore(dir, 'legacy-project')
    const ws = await store.load()
    expect(ws.schemaVersion).toBe('1.0.0')
  })
})
