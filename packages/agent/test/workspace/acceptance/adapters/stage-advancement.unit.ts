import { createClient, type Client } from '@libsql/client'
import { implement, unit } from '@aver/core'
import { stageAdvancement } from '../domains/stage-advancement'
import { WorkspaceStore, WorkspaceOps } from '../../../../src/workspace/index.js'
import type { Question } from '../../../../src/workspace/types.js'

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
      if (!s) throw new Error(`Scenario not found: ${session.scenarioId}`)
      if (s.stage !== stage)
        throw new Error(`Expected stage "${stage}" but got "${s.stage}"`)
    },

    advancementBlocked: async (session, { reason }) => {
      if (!session.lastError)
        throw new Error('Expected advancement to be blocked but no error was thrown')
      if (!session.lastError.message.includes(reason))
        throw new Error(
          `Expected block reason to contain "${reason}" but got "${session.lastError.message}"`,
        )
    },

    advancementSucceeded: async (session, { to }) => {
      if (session.lastError)
        throw new Error(`Expected advancement to succeed but got error: ${session.lastError.message}`)
      if (session.advancedTo !== to)
        throw new Error(`Expected advancement to "${to}" but got "${session.advancedTo}"`)
    },

    confirmationCleared: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      if (!s) throw new Error(`Scenario not found: ${session.scenarioId}`)
      if (s.confirmedBy)
        throw new Error(`Expected confirmation to be cleared but got "${s.confirmedBy}"`)
    },

    transitionRecorded: async (session, { from, to, by }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      if (!s) throw new Error(`Scenario not found: ${session.scenarioId}`)
      const match = s.transitions.find(
        (t) => t.from === from && t.to === to && t.by === by,
      )
      if (!match)
        throw new Error(
          `Expected transition from "${from}" to "${to}" by "${by}" but found none in ${JSON.stringify(s.transitions)}`,
        )
    },
  },
})
