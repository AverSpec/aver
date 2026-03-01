import { expect } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { implement, unit } from '@aver/core'
import { workflowPhaseDetection } from '../domains/workflow-phase-detection'
import { WorkspaceStore, WorkspaceOps, detectPhase } from '../../../src/index.js'

interface PhaseDetectionSession {
  client: Client
  store: WorkspaceStore
  ops: WorkspaceOps
  scenarioIds: string[]
}

export const workflowPhaseDetectionAdapter = implement(workflowPhaseDetection, {
  protocol: unit<PhaseDetectionSession>(() => {
    const client = createClient({ url: ':memory:' })
    const store = new WorkspaceStore(client, 'test')
    const ops = new WorkspaceOps(store)
    return { client, store, ops, scenarioIds: [] }
  }),

  actions: {
    captureScenario: async (session, { behavior }) => {
      const scenario = await session.ops.captureScenario({ behavior })
      session.scenarioIds.push(scenario.id)
    },

    advanceScenario: async (session, { rationale, promotedBy }) => {
      const id = session.scenarioIds[session.scenarioIds.length - 1]
      await session.ops.advanceScenario(id, { rationale, promotedBy })
    },

    confirmScenario: async (session, { confirmer }) => {
      const id = session.scenarioIds[session.scenarioIds.length - 1]
      await session.ops.confirmScenario(id, confirmer)
    },

    linkToDomain: async (session, { domainOperation }) => {
      const id = session.scenarioIds[session.scenarioIds.length - 1]
      await session.ops.linkToDomain(id, { domainOperation })
    },
  },

  queries: {
    workflowPhase: async (session) => {
      const workspace = await session.store.load()
      return detectPhase(workspace).name
    },
  },

  assertions: {
    phaseIs: async (session, { phase }) => {
      const workspace = await session.store.load()
      const actual = detectPhase(workspace).name
      expect(actual).toBe(phase)
    },
  },
})
