import { expect } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { implement, unit } from '@aver/core'
import { backlogManagement } from '../domains/backlog-management'
import { WorkspaceStore } from '../../../src/storage.js'
import { BacklogOps } from '../../../src/backlog-ops.js'
import type { BacklogPriority, BacklogItemType, BacklogStatus } from '../../../src/backlog-types.js'

interface BacklogManagementSession {
  client: Client
  store: WorkspaceStore
  ops: BacklogOps
  currentItemId: string
  lastError?: Error
}

export const backlogManagementAdapter = implement(backlogManagement, {
  protocol: unit<BacklogManagementSession>(() => {
    const client = createClient({ url: ':memory:' })
    const store = new WorkspaceStore(client, 'test')
    const ops = new BacklogOps(store)
    return { client, store, ops, currentItemId: '' }
  }),

  actions: {
    createItem: async (session, { title, priority, type, tags }) => {
      try {
        session.lastError = undefined
        const item = await session.ops.createItem({
          title,
          priority: priority as BacklogPriority | undefined,
          type: type as BacklogItemType | undefined,
          tags,
        })
        session.currentItemId = item.id
      } catch (e: any) {
        session.lastError = e
      }
    },

    selectItem: async (session, { title }) => {
      try {
        session.lastError = undefined
        const items = await session.ops.getItems()
        const match = items.find(i => i.title === title)
        if (!match) throw new Error(`Backlog item with title "${title}" not found`)
        session.currentItemId = match.id
      } catch (e: any) {
        session.lastError = e
      }
    },

    updateItem: async (session, { title, description, status, type, tags, externalUrl }) => {
      try {
        session.lastError = undefined
        await session.ops.updateItem(session.currentItemId, {
          ...(title !== undefined && { title }),
          ...(description !== undefined && { description }),
          ...(status !== undefined && { status: status as BacklogStatus }),
          ...(type !== undefined && { type: type as BacklogItemType }),
          ...(tags !== undefined && { tags }),
          ...(externalUrl !== undefined && { externalUrl }),
        })
      } catch (e: any) {
        session.lastError = e
      }
    },

    deleteItem: async (session) => {
      try {
        session.lastError = undefined
        await session.ops.deleteItem(session.currentItemId)
      } catch (e: any) {
        session.lastError = e
      }
    },

    moveItem: async (session, { priority, after, before }) => {
      try {
        session.lastError = undefined
        // Resolve title-based references to IDs for after/before
        let afterId = after
        let beforeId = before
        if (after || before) {
          const items = await session.ops.getItems()
          if (after) {
            const match = items.find(i => i.title === after)
            if (match) afterId = match.id
          }
          if (before) {
            const match = items.find(i => i.title === before)
            if (match) beforeId = match.id
          }
        }
        await session.ops.moveItem(session.currentItemId, {
          priority: priority as BacklogPriority | undefined,
          after: afterId,
          before: beforeId,
        })
      } catch (e: any) {
        session.lastError = e
      }
    },

    addReference: async (session, { label, path }) => {
      try {
        session.lastError = undefined
        const item = await session.ops.getItem(session.currentItemId)
        if (!item) throw new Error(`Backlog item "${session.currentItemId}" not found`)
        const refs = [...(item.references ?? []), { label, path }]
        await session.ops.updateItem(session.currentItemId, { references: refs })
      } catch (e: any) {
        session.lastError = e
      }
    },

    linkScenario: async (session, { scenarioId }) => {
      try {
        session.lastError = undefined
        const item = await session.ops.getItem(session.currentItemId)
        if (!item) throw new Error(`Backlog item "${session.currentItemId}" not found`)
        const ids = [...(item.scenarioIds ?? []), scenarioId]
        await session.ops.updateItem(session.currentItemId, { scenarioIds: ids })
      } catch (e: any) {
        session.lastError = e
      }
    },
  },

  queries: {
    itemStatus: async (session) => {
      const item = await session.ops.getItem(session.currentItemId)
      return item?.status ?? 'unknown'
    },

    itemPriority: async (session) => {
      const item = await session.ops.getItem(session.currentItemId)
      return item?.priority ?? 'unknown'
    },

    itemCount: async (session, { status, priority, type, tag }) => {
      const items = await session.ops.getItems({
        ...(status !== undefined && { status: status as BacklogStatus }),
        ...(priority !== undefined && { priority: priority as BacklogPriority }),
        ...(type !== undefined && { type: type as BacklogItemType }),
        ...(tag !== undefined && { tag }),
      })
      return items.length
    },

    summaryCount: async (session, { status }) => {
      const summary = await session.ops.getSummary()
      return summary[status as BacklogStatus] ?? 0
    },

    summaryTotal: async (session) => {
      const summary = await session.ops.getSummary()
      return summary.total
    },

    summaryByPriority: async (session, { priority }) => {
      const summary = await session.ops.getSummary()
      return summary.byPriority[priority as BacklogPriority] ?? 0
    },

    itemOrder: async (session, { priority }) => {
      const items = await session.ops.getItems({
        ...(priority !== undefined && { priority: priority as BacklogPriority }),
      })
      return items.map(i => i.title)
    },
  },

  assertions: {
    itemExists: async (session, { title }) => {
      const items = await session.ops.getItems()
      const match = items.find(i => i.title === title)
      expect(match).toBeDefined()
    },

    itemIsAt: async (session, { status }) => {
      const item = await session.ops.getItem(session.currentItemId)
      expect(item).toBeDefined()
      expect(item!.status).toBe(status)
    },

    itemHasPriority: async (session, { priority }) => {
      const item = await session.ops.getItem(session.currentItemId)
      expect(item).toBeDefined()
      expect(item!.priority).toBe(priority)
    },

    itemHasReference: async (session, { label, path }) => {
      const item = await session.ops.getItem(session.currentItemId)
      expect(item).toBeDefined()
      const ref = item!.references?.find(r => r.label === label && r.path === path)
      expect(ref).toBeDefined()
    },

    itemRankedBefore: async (session, { other }) => {
      const items = await session.ops.getItems()
      const currentIdx = items.findIndex(i => i.id === session.currentItemId)
      const otherIdx = items.findIndex(i => i.title === other)
      expect(currentIdx).toBeGreaterThanOrEqual(0)
      expect(otherIdx).toBeGreaterThanOrEqual(0)
      expect(currentIdx).toBeLessThan(otherIdx)
    },

    itemHasScenarioLink: async (session, { scenarioId }) => {
      const item = await session.ops.getItem(session.currentItemId)
      expect(item).toBeDefined()
      expect(item!.scenarioIds).toContain(scenarioId)
    },

    itemNotFound: async (session, { id }) => {
      const item = await session.ops.getItem(id)
      expect(item).toBeUndefined()
    },

    itemHasType: async (session, { type }) => {
      const item = await session.ops.getItem(session.currentItemId)
      expect(item).toBeDefined()
      expect(item!.type).toBe(type)
    },

    itemHasTags: async (session, { tags }) => {
      const item = await session.ops.getItem(session.currentItemId)
      expect(item).toBeDefined()
      expect(item!.tags).toEqual(tags)
    },

    itemHasExternalUrl: async (session, { url }) => {
      const item = await session.ops.getItem(session.currentItemId)
      expect(item).toBeDefined()
      expect(item!.externalUrl).toBe(url)
    },

    itemDeleted: async (session) => {
      const item = await session.ops.getItem(session.currentItemId)
      expect(item).toBeUndefined()
    },

    operationFailed: async (session, { message }) => {
      expect(session.lastError).toBeDefined()
      expect(session.lastError!.message).toContain(message)
    },
  },
})
