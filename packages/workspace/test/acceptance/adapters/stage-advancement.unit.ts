import { expect } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { implement, unit } from '@aver/core'
import { stageAdvancement } from '../domains/stage-advancement'
import { WorkspaceStore, WorkspaceOps } from '../../../src/index.js'
import type { Question } from '../../../src/types.js'

interface StageAdvancementSession {
  client: Client
  store: WorkspaceStore
  ops: WorkspaceOps
  scenarioId: string
  lastQuestionId: string
  lastError?: Error
  advancedTo?: string
}

export const stageAdvancementAdapter = implement(stageAdvancement, {
  protocol: unit<StageAdvancementSession>(() => {
    const client = createClient({ url: ':memory:' })
    const store = new WorkspaceStore(client, 'test')
    const ops = new WorkspaceOps(store)
    return { client, store, ops, scenarioId: '', lastQuestionId: '' }
  }),

  actions: {
    captureScenario: async (session, { behavior }) => {
      try {
        session.lastError = undefined
        session.advancedTo = undefined
        const scenario = await session.ops.captureScenario({ behavior })
        session.scenarioId = scenario.id
      } catch (e: any) {
        session.lastError = e
      }
    },

    confirmScenario: async (session, { confirmer }) => {
      try {
        session.lastError = undefined
        await session.ops.confirmScenario(session.scenarioId, confirmer)
      } catch (e: any) {
        session.lastError = e
      }
    },

    advanceScenario: async (session, { rationale, promotedBy }) => {
      try {
        session.lastError = undefined
        session.advancedTo = undefined
        const before = await session.ops.getScenario(session.scenarioId)
        await session.ops.advanceScenario(session.scenarioId, { rationale, promotedBy })
        const after = await session.ops.getScenario(session.scenarioId)
        if (after && before && after.stage !== before.stage) {
          session.advancedTo = after.stage
        }
      } catch (e: any) {
        session.lastError = e
      }
    },

    revisitScenario: async (session, { targetStage, rationale }) => {
      try {
        session.lastError = undefined
        await session.ops.revisitScenario(session.scenarioId, {
          targetStage: targetStage as any,
          rationale,
        })
      } catch (e: any) {
        session.lastError = e
      }
    },

    addQuestion: async (session, { text }) => {
      try {
        session.lastError = undefined
        const question = await session.ops.addQuestion(session.scenarioId, text)
        session.lastQuestionId = question.id
      } catch (e: any) {
        session.lastError = e
      }
    },

    resolveQuestion: async (session, { answer }) => {
      try {
        session.lastError = undefined
        await session.ops.resolveQuestion(session.scenarioId, session.lastQuestionId, answer)
      } catch (e: any) {
        session.lastError = e
      }
    },

    linkToDomain: async (session, { domainOperation, testNames }) => {
      try {
        session.lastError = undefined
        await session.ops.linkToDomain(session.scenarioId, { domainOperation, testNames })
      } catch (e: any) {
        session.lastError = e
      }
    },
  },

  queries: {
    scenarioStage: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      return s ? s.stage : 'unknown'
    },

    scenarioConfirmation: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      return s?.confirmedBy ?? null
    },

    openQuestionCount: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      if (!s) return 0
      return s.questions.filter((q: Question) => !q.answer).length
    },

    domainLinks: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      return {
        domainOperation: s?.domainOperation,
        testNames: s?.testNames ?? [],
      }
    },
  },

  assertions: {
    scenarioIsAt: async (session, { stage }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      expect(s!.stage).toBe(stage)
    },

    advancementBlocked: async (session, { reason }) => {
      expect(session.lastError).toBeDefined()
      expect(session.lastError!.message).toContain(reason)
    },

    advancementSucceeded: async (session, { to }) => {
      expect(session.lastError).toBeUndefined()
      expect(session.advancedTo).toBe(to)
    },

    confirmationCleared: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      expect(s!.confirmedBy).toBeFalsy()
    },

    confirmationIs: async (session, { confirmer }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      expect(s!.confirmedBy).toBe(confirmer)
    },

    transitionRecorded: async (session, { from, to, by }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      const match = s!.transitions.find(
        (t) => t.from === from && t.to === to && t.by === by,
      )
      expect(match).toBeDefined()
    },

    domainLinksAre: async (session, { domainOperation, testNames }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      if (domainOperation !== undefined) {
        expect(s!.domainOperation).toBe(domainOperation)
      }
      if (testNames !== undefined) {
        const actual = s!.testNames ?? []
        expect(actual.sort()).toEqual([...testNames].sort())
      }
    },

    operationFailed: async (session, { message }) => {
      expect(session.lastError).toBeDefined()
      expect(session.lastError!.message).toContain(message)
    },
  },
})
