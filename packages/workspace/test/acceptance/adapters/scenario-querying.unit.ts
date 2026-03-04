import { expect } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { implement, unit } from '@aver/core'
import { scenarioQuerying } from '../domains/scenario-querying'
import { WorkspaceStore, WorkspaceOps } from '../../../src/index.js'

interface ScenarioQueryingSession {
  client: Client
  store: WorkspaceStore
  ops: WorkspaceOps
  scenarioId: string
  lastQuestionId: string
  lastFilterCount: number
  lastProjectedKeys: string
}

export const scenarioQueryingAdapter = implement(scenarioQuerying, {
  protocol: unit<ScenarioQueryingSession>(() => {
    const client = createClient({ url: ':memory:' })
    const store = new WorkspaceStore(client, 'test')
    const ops = new WorkspaceOps(store)
    return { client, store, ops, scenarioId: '', lastQuestionId: '', lastFilterCount: 0, lastProjectedKeys: '' }
  }),

  actions: {
    captureScenario: async (session, { behavior, context, story, mode }) => {
      const scenario = await session.ops.captureScenario({ behavior, context, story, mode })
      session.scenarioId = scenario.id
    },

    advanceScenario: async (session, { rationale, promotedBy }) => {
      await session.ops.advanceScenario(session.scenarioId, { rationale, promotedBy })
    },

    confirmScenario: async (session, { confirmer }) => {
      await session.ops.confirmScenario(session.scenarioId, confirmer)
    },

    addQuestion: async (session, { text }) => {
      const question = await session.ops.addQuestion(session.scenarioId, text)
      session.lastQuestionId = question.id
    },

    resolveQuestion: async (session, { answer }) => {
      await session.ops.resolveQuestion(session.scenarioId, session.lastQuestionId, answer)
    },

    linkToDomain: async (session, { domainOperation }) => {
      await session.ops.linkToDomain(session.scenarioId, { domainOperation })
    },
  },

  queries: {
    summaryCount: async (session, { stage }) => {
      const summary = await session.ops.getScenarioSummary()
      return (summary as any)[stage] ?? 0
    },

    summaryOpenQuestions: async (session) => {
      const summary = await session.ops.getScenarioSummary()
      return summary.openQuestions
    },

    scenariosByFilter: async (session, filter) => {
      const results = await session.ops.getScenarios(filter as any)
      session.lastFilterCount = results.length
      if (filter.fields && filter.fields.length > 0 && results.length > 0) {
        session.lastProjectedKeys = Object.keys(results[0]).sort().join(',')
      }
      return results.length
    },

    lastProjectedKeys: async (session) => {
      return session.lastProjectedKeys
    },

    advanceCandidateCount: async (session) => {
      const candidates = await session.ops.getAdvanceCandidates()
      return candidates.length
    },
  },

  assertions: {
    stageCountIs: async (session, { stage, count }) => {
      const summary = await session.ops.getScenarioSummary()
      expect((summary as any)[stage]).toBe(count)
    },

    filterReturns: async (session, { count }) => {
      expect(session.lastFilterCount).toBe(count)
    },

    openQuestionsCountIs: async (session, { count }) => {
      const summary = await session.ops.getScenarioSummary()
      expect(summary.openQuestions).toBe(count)
    },

    projectedKeysAre: async (session, { keys }) => {
      expect(session.lastProjectedKeys).toBe(keys)
    },

    advanceCandidatesAre: async (session, { count }) => {
      const candidates = await session.ops.getAdvanceCandidates()
      expect(candidates.length).toBe(count)
    },
  },
})
