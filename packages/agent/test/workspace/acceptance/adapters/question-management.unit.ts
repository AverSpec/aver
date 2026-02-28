import { expect } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { implement, unit } from '@aver/core'
import { questionManagement } from '../domains/question-management'
import { WorkspaceStore, WorkspaceOps } from '../../../../src/workspace/index.js'
import type { Question } from '../../../../src/workspace/types.js'

interface QuestionManagementSession {
  client: Client
  store: WorkspaceStore
  ops: WorkspaceOps
  scenarioId: string
  lastQuestionId: string
  lastError?: Error
}

export const questionManagementAdapter = implement(questionManagement, {
  protocol: unit<QuestionManagementSession>(() => {
    const client = createClient({ url: ':memory:' })
    const store = new WorkspaceStore(client, 'test')
    const ops = new WorkspaceOps(store)
    return { client, store, ops, scenarioId: '', lastQuestionId: '' }
  }),

  actions: {
    captureScenario: async (session, { behavior }) => {
      try {
        session.lastError = undefined
        const scenario = await session.ops.captureScenario({ behavior })
        session.scenarioId = scenario.id
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
  },

  queries: {
    openQuestionCount: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      if (!s) return 0
      return s.questions.filter((q: Question) => !q.answer).length
    },

    questionAnswer: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      if (!s) return undefined
      const q = s.questions.find((q: Question) => q.id === session.lastQuestionId)
      return q?.answer
    },

    questionResolvedAt: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      if (!s) return undefined
      const q = s.questions.find((q: Question) => q.id === session.lastQuestionId)
      return q?.resolvedAt
    },
  },

  assertions: {
    questionExists: async (session, { text }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      const match = s!.questions.find((q: Question) => q.text === text)
      expect(match).toBeDefined()
      expect(match!.id).toBeTruthy()
    },

    questionResolved: async (session, { answer }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      const q = s!.questions.find((q: Question) => q.id === session.lastQuestionId)
      expect(q).toBeDefined()
      expect(q!.answer).toBe(answer)
      expect(q!.resolvedAt).toBeTruthy()
    },

    questionCountIs: async (session, { count }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      const open = s!.questions.filter((q: Question) => !q.answer).length
      expect(open).toBe(count)
    },

    operationFailed: async (session, { message }) => {
      expect(session.lastError).toBeDefined()
      expect(session.lastError!.message).toContain(message)
    },
  },
})
