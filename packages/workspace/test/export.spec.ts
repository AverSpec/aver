import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { WorkspaceOps } from '../src/operations'
import { WorkspaceStore } from '../src/storage'
import { exportMarkdown, exportJson, importJson } from '../src/export'

describe('export', () => {
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

  describe('exportMarkdown', () => {
    it('produces readable markdown grouped by stage', () => {
      ops.recordObservation({ behavior: 'API returns 200 for errors' })
      ops.recordIntent({ behavior: 'Users can cancel orders', story: 'Cancel Order' })

      const md = exportMarkdown(store.load())
      expect(md).toContain('# Workspace Summary')
      expect(md).toContain('## Observed (1)')
      expect(md).toContain('API returns 200 for errors')
      expect(md).toContain('## Intended (1)')
      expect(md).toContain('Cancel Order')
    })

    it('includes open questions', () => {
      const item = ops.recordObservation({ behavior: 'test' })
      ops.addQuestion(item.id, 'Why does this happen?')

      const md = exportMarkdown(store.load())
      expect(md).toContain('Why does this happen?')
    })
  })

  describe('exportJson / importJson', () => {
    it('round-trips workspace items through JSON', () => {
      ops.recordObservation({ behavior: 'a' })
      ops.recordIntent({ behavior: 'b', story: 'Story B' })

      const json = exportJson(store.load())
      const parsed = JSON.parse(json)
      expect(parsed.items).toHaveLength(2)

      // Import into a fresh store
      const dir2 = mkdtempSync(join(tmpdir(), 'aver-workspace-'))
      const store2 = new WorkspaceStore(dir2, 'other-project')
      const ops2 = new WorkspaceOps(store2)

      const imported = importJson(store2, json)
      expect(imported.added).toBe(2)
      expect(ops2.getItems()).toHaveLength(2)

      rmSync(dir2, { recursive: true, force: true })
    })

    it('skips duplicate items on import', () => {
      const item = ops.recordObservation({ behavior: 'a' })
      const json = exportJson(store.load())

      const imported = importJson(store, json)
      expect(imported.added).toBe(0)
      expect(imported.skipped).toBe(1)
      expect(ops.getItems()).toHaveLength(1)
    })
  })
})
