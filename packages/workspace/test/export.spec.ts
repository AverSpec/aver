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
      ops.captureScenario({ behavior: 'API returns 200 for errors' })
      ops.captureScenario({ behavior: 'Users can cancel orders', story: 'Cancel Order', mode: 'intended' })

      const md = exportMarkdown(store.load())
      expect(md).toContain('# Scenario Summary')
      expect(md).toContain('## Captured (2)')
      expect(md).toContain('API returns 200 for errors')
      expect(md).toContain('Cancel Order')
    })

    it('includes open questions without emoji', () => {
      const scenario = ops.captureScenario({ behavior: 'test' })
      ops.addQuestion(scenario.id, 'Why does this happen?')

      const md = exportMarkdown(store.load())
      expect(md).toContain('Why does this happen?')
      // No emoji in output (project convention)
      expect(md).not.toContain('\u2753') // no red question mark emoji
      expect(md).toContain('[Q]')
    })
  })

  describe('exportJson / importJson', () => {
    it('round-trips workspace scenarios through JSON', () => {
      ops.captureScenario({ behavior: 'a' })
      ops.captureScenario({ behavior: 'b', story: 'Story B', mode: 'intended' })

      const json = exportJson(store.load())
      const parsed = JSON.parse(json)
      expect(parsed.scenarios).toHaveLength(2)

      // Import into a fresh store
      const dir2 = mkdtempSync(join(tmpdir(), 'aver-workspace-'))
      const store2 = new WorkspaceStore(dir2, 'other-project')
      const ops2 = new WorkspaceOps(store2)

      const imported = importJson(store2, json)
      expect(imported.added).toBe(2)
      expect(ops2.getScenarios()).toHaveLength(2)

      rmSync(dir2, { recursive: true, force: true })
    })

    it('skips duplicate scenarios on import', () => {
      ops.captureScenario({ behavior: 'a' })
      const json = exportJson(store.load())

      const imported = importJson(store, json)
      expect(imported.added).toBe(0)
      expect(imported.skipped).toBe(1)
      expect(ops.getScenarios()).toHaveLength(1)
    })
  })
})
