import { expect } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { implement, unit } from '@aver/core'
import { batchOperations } from '../domains/batch-operations'
import { WorkspaceStore, WorkspaceOps } from '../../../src/index.js'
import type { BatchAdvanceResult, BatchRevisitResult } from '../../../src/operations.js'
import type { Stage } from '../../../src/types.js'

interface BatchOperationsSession {
  client: Client
  store: WorkspaceStore
  ops: WorkspaceOps
  scenarioIds: string[]
  advanceResult?: BatchAdvanceResult
  revisitResult?: BatchRevisitResult
}

export const batchOperationsAdapter = implement(batchOperations, {
  protocol: unit<BatchOperationsSession>(() => {
    const client = createClient({ url: ':memory:' })
    const store = new WorkspaceStore(client, 'test')
    const ops = new WorkspaceOps(store)
    return { client, store, ops, scenarioIds: [] }
  }),

  actions: {
    captureScenario: async (session, { behavior, context, story }) => {
      const scenario = await session.ops.captureScenario({ behavior, context, story })
      session.scenarioIds.push(scenario.id)
    },

    advanceSingle: async (session, { index, rationale, promotedBy }) => {
      await session.ops.advanceScenario(session.scenarioIds[index], { rationale, promotedBy })
    },

    confirmScenario: async (session, { index, confirmer }) => {
      await session.ops.confirmScenario(session.scenarioIds[index], confirmer)
    },

    addQuestion: async (session, { index, text }) => {
      await session.ops.addQuestion(session.scenarioIds[index], text)
    },

    batchAdvance: async (session, { rationale, promotedBy }) => {
      session.advanceResult = await session.ops.batchAdvance({
        ids: session.scenarioIds,
        rationale,
        promotedBy,
      })
    },

    batchRevisit: async (session, { targetStage, rationale }) => {
      session.revisitResult = await session.ops.batchRevisit({
        ids: session.scenarioIds,
        targetStage: targetStage as Stage,
        rationale,
      })
    },

    injectFakeId: async (session, { id }) => {
      session.scenarioIds.push(id)
    },
  },

  queries: {
    advancedCount: async (session) => {
      return session.advanceResult?.summary.advanced ?? 0
    },

    blockedCount: async (session) => {
      return session.advanceResult?.summary.blocked ?? 0
    },

    errorCount: async (session) => {
      return session.advanceResult?.summary.errors ??
        session.revisitResult?.summary.errors ?? 0
    },

    revisitedCount: async (session) => {
      return session.revisitResult?.summary.revisited ?? 0
    },
  },

  assertions: {
    scenarioAtStage: async (session, { index, stage }) => {
      const s = await session.ops.getScenario(session.scenarioIds[index])
      expect(s).toBeDefined()
      expect(s!.stage).toBe(stage)
    },

    resultStatus: async (session, { index, status }) => {
      const advResult = session.advanceResult?.results[index]
      const revResult = session.revisitResult?.results[index]
      const result = advResult ?? revResult
      expect(result).toBeDefined()
      expect(result!.status).toBe(status)
    },

    advanceSummaryIs: async (session, { advanced, blocked, errors }) => {
      expect(session.advanceResult).toBeDefined()
      expect(session.advanceResult!.summary).toEqual({ advanced, blocked, errors })
    },

    revisitSummaryIs: async (session, { revisited, errors }) => {
      expect(session.revisitResult).toBeDefined()
      expect(session.revisitResult!.summary).toEqual({ revisited, errors })
    },
  },
})
