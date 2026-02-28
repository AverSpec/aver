import { expect } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { implement, unit } from '@aver/core'
import { scenarioQuerying } from '../domains/scenario-querying'
import { WorkspaceStore, WorkspaceOps } from '../../../../src/workspace/index.js'

interface ScenarioQueryingSession {
  client: Client
  store: WorkspaceStore
  ops: WorkspaceOps
  scenarioId: string
  lastQuestionId: string
  lastFilterCount: number
}

export const scenarioQueryingAdapter = implement(scenarioQuerying, {
  protocol: unit<ScenarioQueryingSession>(() => {
    const client = createClient({ url: ':memory:' })
    const store = new WorkspaceStore(client, 'test')
    const ops = new WorkspaceOps(store)
    return { client, store, ops, scenarioId: '', lastQuestionId: '', lastFilterCount: 0 }
  }),

  actions: {
    captureScenario: async (session, { behavior, context, story }) => {
      const scenario = await session.ops.captureScenario({ behavior, context, story })
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

    scenariosByFilter: async (session, filter) => {
      const results = await session.ops.getScenarios(filter as any)
      session.lastFilterCount = results.length
      return results.length
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

    advanceCandidatesAre: async (session, { count }) => {
      const candidates = await session.ops.getAdvanceCandidates()
      expect(candidates.length).toBe(count)
    },
  },
})
