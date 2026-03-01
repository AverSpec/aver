import { expect } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { implement, unit } from '@aver/core'
import { workspacePersistence } from '../domains/workspace-persistence'
import { WorkspaceStore, WorkspaceOps } from '../../../src/index.js'

interface PersistenceSession {
  client: Client
  store: WorkspaceStore
  ops: WorkspaceOps
}

export const workspacePersistenceAdapter = implement(workspacePersistence, {
  protocol: unit<PersistenceSession>(() => {
    const client = createClient({ url: ':memory:' })
    const store = new WorkspaceStore(client, 'test')
    const ops = new WorkspaceOps(store)
    return { client, store, ops }
  }),

  actions: {
    captureScenario: async (session, { behavior }) => {
      await session.ops.captureScenario({ behavior })
    },

    reloadFromDisk: async (session) => {
      const newStore = new WorkspaceStore(session.client, 'test')
      session.store = newStore
      session.ops = new WorkspaceOps(newStore)
    },
  },

  queries: {
    scenarioCount: async (session) => {
      const workspace = await session.store.load()
      return workspace.scenarios.length
    },
  },

  assertions: {
    scenarioSurvivedReload: async (session, { behavior }) => {
      const workspace = await session.store.load()
      const match = workspace.scenarios.find((s: any) => s.behavior === behavior)
      expect(match).toBeDefined()
    },

    scenarioCountIs: async (session, { count }) => {
      const workspace = await session.store.load()
      expect(workspace.scenarios.length).toBe(count)
    },
  },
})
