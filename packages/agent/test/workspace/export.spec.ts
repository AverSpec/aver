import { describe, it, expect, beforeEach } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { WorkspaceOps } from '../../src/workspace/operations'
import { WorkspaceStore } from '../../src/workspace/storage'
import { exportMarkdown, exportJson, importJson } from '../../src/workspace/export'

describe('export', () => {
  let client: Client
  let ops: WorkspaceOps
  let store: WorkspaceStore

  beforeEach(() => {
    client = createClient({ url: ':memory:' })
    store = new WorkspaceStore(client, 'test-project')
    ops = new WorkspaceOps(store)
  })

  describe('exportMarkdown', () => {
    it('produces readable markdown grouped by stage', async () => {
      await ops.captureScenario({ behavior: 'API returns 200 for errors' })
      await ops.captureScenario({ behavior: 'Users can cancel orders', story: 'Cancel Order', mode: 'intended' })

      const md = exportMarkdown(await store.load())
      expect(md).toContain('# Scenario Summary')
      expect(md).toContain('## Captured (2)')
      expect(md).toContain('API returns 200 for errors')
      expect(md).toContain('Cancel Order')
    })

    it('includes open questions without emoji', async () => {
      const scenario = await ops.captureScenario({ behavior: 'test' })
      await ops.addQuestion(scenario.id, 'Why does this happen?')

      const md = exportMarkdown(await store.load())
      expect(md).toContain('Why does this happen?')
      // No emoji in output (project convention)
      expect(md).not.toContain('\u2753') // no red question mark emoji
      expect(md).toContain('[Q]')
    })
  })

  describe('exportJson / importJson', () => {
    it('round-trips workspace scenarios through JSON', async () => {
      await ops.captureScenario({ behavior: 'a' })
      await ops.captureScenario({ behavior: 'b', story: 'Story B', mode: 'intended' })

      const json = exportJson(await store.load())
      const parsed = JSON.parse(json)
      expect(parsed.scenarios).toHaveLength(2)

      // Import into a fresh store
      const client2 = createClient({ url: ':memory:' })
      const store2 = new WorkspaceStore(client2, 'other-project')
      const ops2 = new WorkspaceOps(store2)

      const imported = await importJson(store2, json)
      expect(imported.added).toBe(2)
      expect(await ops2.getScenarios()).toHaveLength(2)
    })

    it('throws a clear error for malformed JSON', async () => {
      await expect(importJson(store, 'not json at all')).rejects.toThrow(
        'Import failed: input is not valid JSON'
      )
    })

    it('throws a clear error when scenarios array is missing', async () => {
      await expect(importJson(store, '{}')).rejects.toThrow(
        'Import failed: expected an object with a "scenarios" array'
      )
    })

    it('throws a clear error when scenarios is not an array', async () => {
      await expect(importJson(store, '{"scenarios": "oops"}')).rejects.toThrow(
        'Import failed: expected an object with a "scenarios" array'
      )
    })

    it('throws a clear error for non-object JSON values', async () => {
      await expect(importJson(store, '"just a string"')).rejects.toThrow(
        'Import failed: expected an object with a "scenarios" array'
      )
    })

    it('skips duplicate scenarios on import', async () => {
      await ops.captureScenario({ behavior: 'a' })
      const json = exportJson(await store.load())

      const imported = await importJson(store, json)
      expect(imported.added).toBe(0)
      expect(imported.skipped).toBe(1)
      expect(await ops.getScenarios()).toHaveLength(1)
    })
  })
})
