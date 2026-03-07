import { expect } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { implement, type Protocol } from '@aver/core'
import { averWorkspace } from '../domains/aver-workspace'
import { WorkspaceStore, WorkspaceOps } from '../../../src/index.js'
import { detectPhase } from '../../../src/phase.js'
import { exportMarkdown, exportJson, importJson } from '../../../src/export.js'
import type { Scenario, Stage } from '../../../src/types.js'
import { createOtelCollector } from '../../support/otel-collector.js'

interface AverWorkspaceSession {
  client: Client
  store: WorkspaceStore
  ops: WorkspaceOps
  lastError?: Error
  lastAdvancedTo?: string
  lastImportResult?: { added: number; skipped: number }
  lastQuestionId: string
  lastFilterResult: number
  scenarioIds: Map<string, string> // behavior → id for lookup
}

const { collector, shutdown } = createOtelCollector()

const protocol: Protocol<AverWorkspaceSession> = {
  name: 'unit',
  async setup() {
    const client = createClient({ url: ':memory:' })
    const store = new WorkspaceStore(client, 'test')
    const ops = new WorkspaceOps(store)
    return {
      client,
      store,
      ops,
      lastQuestionId: '',
      lastFilterResult: 0,
      scenarioIds: new Map(),
    }
  },
  async teardown() {
    await shutdown()
  },
  // telemetry: collector, — re-enable when WorkspaceOps is instrumented with OTel spans
}

export const averWorkspaceAdapter = implement(averWorkspace, {
  protocol,

  actions: {
    captureScenario: async (session, input) => {
      try {
        session.lastError = undefined
        const scenario = await session.ops.captureScenario(input)
        session.scenarioIds.set(scenario.behavior, scenario.id)
      } catch (e: any) {
        session.lastError = e
      }
    },

    updateScenario: async (session, { id, ...fields }) => {
      try {
        session.lastError = undefined
        await session.ops.updateScenario(id, fields)
      } catch (e: any) {
        session.lastError = e
      }
    },

    advanceScenario: async (session, { id, rationale, promotedBy }) => {
      try {
        session.lastError = undefined
        session.lastAdvancedTo = undefined
        const before = await session.ops.getScenario(id)
        await session.ops.advanceScenario(id, { rationale, promotedBy })
        const after = await session.ops.getScenario(id)
        if (after && before && after.stage !== before.stage) {
          session.lastAdvancedTo = after.stage
        }
      } catch (e: any) {
        session.lastError = e
      }
    },

    revisitScenario: async (session, { id, targetStage, rationale }) => {
      try {
        session.lastError = undefined
        await session.ops.revisitScenario(id, { targetStage: targetStage as Stage, rationale })
      } catch (e: any) {
        session.lastError = e
      }
    },

    confirmScenario: async (session, { id, confirmer }) => {
      try {
        session.lastError = undefined
        await session.ops.confirmScenario(id, confirmer)
      } catch (e: any) {
        session.lastError = e
      }
    },

    deleteScenario: async (session, { id }) => {
      try {
        session.lastError = undefined
        await session.ops.deleteScenario(id)
      } catch (e: any) {
        session.lastError = e
      }
    },

    addQuestion: async (session, { scenarioId, text }) => {
      try {
        session.lastError = undefined
        const question = await session.ops.addQuestion(scenarioId, text)
        session.lastQuestionId = question.id
      } catch (e: any) {
        session.lastError = e
      }
    },

    resolveQuestion: async (session, { scenarioId, questionId, answer }) => {
      try {
        session.lastError = undefined
        await session.ops.resolveQuestion(scenarioId, questionId, answer)
      } catch (e: any) {
        session.lastError = e
      }
    },

    linkToDomain: async (session, { scenarioId, domainOperation, testNames, approvalBaseline }) => {
      try {
        session.lastError = undefined
        await session.ops.linkToDomain(scenarioId, { domainOperation, testNames, approvalBaseline })
      } catch (e: any) {
        session.lastError = e
      }
    },

    importScenarios: async (session, { json }) => {
      try {
        session.lastError = undefined
        const result = await importJson(session.store, json)
        session.lastImportResult = result
      } catch (e: any) {
        session.lastError = e
      }
    },
  },

  queries: {
    scenarioSummary: async (session) => {
      return session.ops.getScenarioSummary()
    },

    scenarios: async (session, filters) => {
      const result = await session.ops.getScenarios(filters ?? undefined) as Scenario[]
      session.lastFilterResult = result.length
      return result.map(s => ({ id: s.id, stage: s.stage, behavior: s.behavior, domainOperation: s.domainOperation }))
    },

    advanceCandidates: async (session) => {
      const candidates = await session.ops.getAdvanceCandidates()
      return candidates.map(s => ({ id: s.id, stage: s.stage }))
    },

    workflowPhase: async (session) => {
      const workspace = await session.store.load()
      return detectPhase(workspace)
    },

    exportedScenarios: async (session, { format }) => {
      const workspace = await session.store.load()
      return format === 'json' ? exportJson(workspace) : exportMarkdown(workspace)
    },
  },

  assertions: {
    scenarioIsAt: async (session, { id, stage }) => {
      const s = await session.ops.getScenario(id)
      expect(s).toBeDefined()
      expect(s!.stage).toBe(stage)
    },

    scenarioHasBehavior: async (session, { id, behavior }) => {
      const s = await session.ops.getScenario(id)
      expect(s).toBeDefined()
      expect(s!.behavior).toBe(behavior)
    },

    scenarioHasConfirmation: async (session, { id, confirmer }) => {
      const s = await session.ops.getScenario(id)
      expect(s).toBeDefined()
      expect(s!.confirmedBy).toBe(confirmer)
    },

    confirmationCleared: async (session, { id }) => {
      const s = await session.ops.getScenario(id)
      expect(s).toBeDefined()
      expect(s!.confirmedBy).toBeFalsy()
    },

    advancementBlocked: async (session, { id: _id, reason }) => {
      expect(session.lastError).toBeDefined()
      expect(session.lastError!.message).toContain(reason)
    },

    advancementSucceeded: async (session, { id, to }) => {
      expect(session.lastError).toBeUndefined()
      const s = await session.ops.getScenario(id)
      expect(s).toBeDefined()
      expect(s!.stage).toBe(to)
    },

    transitionRecorded: async (session, { id, from, to, by }) => {
      const s = await session.ops.getScenario(id)
      expect(s).toBeDefined()
      const match = s!.transitions.find(t => t.from === from && t.to === to && t.by === by)
      expect(match).toBeDefined()
    },

    questionExists: async (session, { scenarioId, text }) => {
      const s = await session.ops.getScenario(scenarioId)
      expect(s).toBeDefined()
      const q = s!.questions.find((q: Question) => q.text === text)
      expect(q).toBeDefined()
    },

    questionResolved: async (session, { scenarioId, questionId, answer }) => {
      const s = await session.ops.getScenario(scenarioId)
      expect(s).toBeDefined()
      const q = s!.questions.find((q: Question) => q.id === questionId)
      expect(q).toBeDefined()
      expect(q!.answer).toBe(answer)
      expect(q!.resolvedAt).toBeDefined()
    },

    domainLinksAre: async (session, { id, domainOperation, testNames }) => {
      const s = await session.ops.getScenario(id)
      expect(s).toBeDefined()
      if (domainOperation !== undefined) {
        expect(s!.domainOperation).toBe(domainOperation)
      }
      if (testNames !== undefined) {
        expect([...(s!.testNames ?? [])].sort()).toEqual([...testNames].sort())
      }
    },

    scenarioCountIs: async (session, { count }) => {
      const all = await session.ops.getScenarios()
      expect(all.length).toBe(count)
    },

    stageCountIs: async (session, { stage, count }) => {
      const summary = await session.ops.getScenarioSummary()
      expect((summary as any)[stage]).toBe(count)
    },

    filterReturns: async (session, { count }) => {
      expect(session.lastFilterResult).toBe(count)
    },

    importResultIs: async (session, { added, skipped }) => {
      expect(session.lastImportResult).toBeDefined()
      expect(session.lastImportResult!.added).toBe(added)
      expect(session.lastImportResult!.skipped).toBe(skipped)
    },

    exportContains: async (session, { format, text }) => {
      const workspace = await session.store.load()
      const exported = format === 'json' ? exportJson(workspace) : exportMarkdown(workspace)
      expect(exported).toContain(text)
    },

    operationFailed: async (session, { message }) => {
      expect(session.lastError).toBeDefined()
      expect(session.lastError!.message).toContain(message)
    },
  },
})
