import { expect } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { implement, unit } from '@aver/core'
import { scenarioExportImport } from '../domains/scenario-export-import'
import {
  WorkspaceStore,
  WorkspaceOps,
  exportMarkdown,
  exportJson,
  importJson,
} from '../../../src/index.js'

interface ExportImportSession {
  client: Client
  store: WorkspaceStore
  ops: WorkspaceOps
  scenarioId: string
  lastImportResult?: { added: number; skipped: number }
}

export const scenarioExportImportAdapter = implement(scenarioExportImport, {
  protocol: unit<ExportImportSession>(() => {
    const client = createClient({ url: ':memory:' })
    const store = new WorkspaceStore(client, 'test')
    const ops = new WorkspaceOps(store)
    return { client, store, ops, scenarioId: '' }
  }),

  actions: {
    captureScenario: async (session, { behavior, story }) => {
      const scenario = await session.ops.captureScenario({ behavior, story })
      session.scenarioId = scenario.id
    },

    addQuestion: async (session, { text }) => {
      await session.ops.addQuestion(session.scenarioId, text)
    },

    importScenarios: async (session, { json }) => {
      session.lastImportResult = await importJson(session.store, json)
    },
  },

  queries: {
    exportedMarkdown: async (session) => {
      const workspace = await session.store.load()
      return exportMarkdown(workspace)
    },

    exportedJson: async (session) => {
      const workspace = await session.store.load()
      return exportJson(workspace)
    },
  },

  assertions: {
    markdownContains: async (session, { text }) => {
      const workspace = await session.store.load()
      const md = exportMarkdown(workspace)
      expect(md).toContain(text)
    },

    importResultIs: async (session, { added, skipped }) => {
      expect(session.lastImportResult).toBeDefined()
      expect(session.lastImportResult!.added).toBe(added)
      expect(session.lastImportResult!.skipped).toBe(skipped)
    },

    scenarioSurvivedRoundTrip: async (session, { behavior }) => {
      const workspace = await session.store.load()
      const match = workspace.scenarios.find((s: any) => s.behavior === behavior)
      expect(match).toBeDefined()
    },

    stageCountIs: async (session, { stage, count }) => {
      const summary = await session.ops.getScenarioSummary()
      expect((summary as any)[stage]).toBe(count)
    },
  },
})
