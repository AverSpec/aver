import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { implement, unit } from '@aver/core'
import { averWorkspace } from '../domains/aver-workspace'
import {
  WorkspaceStore,
  WorkspaceOps,
  exportMarkdown,
  exportJson,
  importJson,
  detectPhase,
} from '../../../src/index'
import type { Scenario, Question } from '../../../src/index'

interface WorkspaceTestSession {
  basePath: string
  store: WorkspaceStore
  ops: WorkspaceOps
  lastCapturedId: string
  lastQuestionId: string
  lastError?: Error
  lastImportResult?: { added: number; skipped: number }
}

export const averWorkspaceAdapter = implement(averWorkspace, {
  protocol: unit<WorkspaceTestSession>(() => {
    const basePath = mkdtempSync(join(tmpdir(), 'aver-workspace-'))
    const store = new WorkspaceStore(basePath, 'test')
    const ops = new WorkspaceOps(store)
    return { basePath, store, ops, lastCapturedId: '', lastQuestionId: '' }
  }),

  actions: {
    captureScenario: async (session, { behavior, context, story, mode }) => {
      try {
        session.lastError = undefined
        const scenario = await session.ops.captureScenario({ behavior, context, story, mode })
        session.lastCapturedId = scenario.id
      } catch (e: any) {
        session.lastError = e
      }
    },

    advanceScenario: async (session, { id, rationale, promotedBy }) => {
      try {
        session.lastError = undefined
        await session.ops.advanceScenario(id, { rationale, promotedBy })
      } catch (e: any) {
        session.lastError = e
      }
    },

    revisitScenario: async (session, { id, targetStage, rationale }) => {
      try {
        session.lastError = undefined
        await session.ops.revisitScenario(id, { targetStage: targetStage as any, rationale })
      } catch (e: any) {
        session.lastError = e
      }
    },

    setConfirmedBy: async (session, { id, confirmer }) => {
      try {
        session.lastError = undefined
        await session.ops.confirmScenario(id, confirmer)
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

    deleteScenario: async (session, { id }) => {
      try {
        session.lastError = undefined
        await session.ops.deleteScenario(id)
      } catch (e: any) {
        session.lastError = e
      }
    },

    importScenarios: async (session, { json }) => {
      try {
        session.lastError = undefined
        session.lastImportResult = await importJson(session.store, json)
      } catch (e: any) {
        session.lastError = e
      }
    },

    reloadFromDisk: async (session) => {
      // Create a fresh store and ops from the same base path, proving disk persistence
      const newStore = new WorkspaceStore(session.basePath, 'test')
      session.store = newStore
      session.ops = new WorkspaceOps(newStore)
    },
  },

  queries: {
    scenario: async (session, { id }) => {
      const s = await session.ops.getScenario(id)
      if (!s) return undefined
      return { stage: s.stage, behavior: s.behavior, mode: s.mode }
    },

    scenarios: async (session, filter) => {
      const list = await session.ops.getScenarios(filter as any)
      return list.map((s: Scenario) => ({ id: s.id, stage: s.stage, behavior: s.behavior }))
    },

    summary: async (session) => {
      return session.ops.getScenarioSummary()
    },

    advanceCandidates: async (session) => {
      return (await session.ops.getAdvanceCandidates()).map((s: Scenario) => ({
        id: s.id,
        stage: s.stage,
      }))
    },

    workflowPhase: async (session) => {
      const workspace = await session.store.load()
      return detectPhase(workspace).name
    },

    exportedMarkdown: async (session) => {
      const workspace = await session.store.load()
      return exportMarkdown(workspace)
    },

    exportedJson: async (session) => {
      const workspace = await session.store.load()
      return exportJson(workspace)
    },

    lastCapturedId: async (session) => {
      return session.lastCapturedId
    },

    lastQuestionId: async (session) => {
      return session.lastQuestionId
    },

    scenarioCount: async (session) => {
      const workspace = await session.store.load()
      return workspace.scenarios.length
    },
  },

  assertions: {
    scenarioHasStage: async (session, { id, stage }) => {
      const s = await session.ops.getScenario(id)
      if (!s) throw new Error(`Scenario not found: ${id}`)
      if (s.stage !== stage)
        throw new Error(`Expected stage "${stage}" but got "${s.stage}"`)
    },

    scenarioHasMode: async (session, { id, mode }) => {
      const s = await session.ops.getScenario(id)
      if (!s) throw new Error(`Scenario not found: ${id}`)
      if (s.mode !== mode)
        throw new Error(`Expected mode "${mode}" but got "${s.mode}"`)
    },

    scenarioHasPromotedFrom: async (session, { id, stage }) => {
      const s = await session.ops.getScenario(id)
      if (!s) throw new Error(`Scenario not found: ${id}`)
      if (s.promotedFrom !== stage)
        throw new Error(`Expected promotedFrom "${stage}" but got "${s.promotedFrom}"`)
    },

    scenarioHasRevisitRationale: async (session, { id, rationale }) => {
      const s = await session.ops.getScenario(id)
      if (!s) throw new Error(`Scenario not found: ${id}`)
      if (s.revisitRationale !== rationale)
        throw new Error(`Expected revisitRationale "${rationale}" but got "${s.revisitRationale}"`)
    },

    scenarioHasDomainOperation: async (session, { id, operation }) => {
      const s = await session.ops.getScenario(id)
      if (!s) throw new Error(`Scenario not found: ${id}`)
      if (s.domainOperation !== operation)
        throw new Error(`Expected domainOperation "${operation}" but got "${s.domainOperation}"`)
    },

    scenarioHasTestNames: async (session, { id, names }) => {
      const s = await session.ops.getScenario(id)
      if (!s) throw new Error(`Scenario not found: ${id}`)
      const actual = s.testNames ?? []
      if (JSON.stringify(actual.sort()) !== JSON.stringify(names.sort()))
        throw new Error(`Expected testNames ${JSON.stringify(names)} but got ${JSON.stringify(actual)}`)
    },

    hasOpenQuestion: async (session, { id, text }) => {
      const s = await session.ops.getScenario(id)
      if (!s) throw new Error(`Scenario not found: ${id}`)
      const open = s.questions.filter((q: Question) => !q.answer)
      const match = open.find((q: Question) => q.text === text)
      if (!match)
        throw new Error(`Expected open question "${text}" but found none`)
    },

    questionIsResolved: async (session, { scenarioId, questionId }) => {
      const s = await session.ops.getScenario(scenarioId)
      if (!s) throw new Error(`Scenario not found: ${scenarioId}`)
      const q = s.questions.find((q: Question) => q.id === questionId)
      if (!q) throw new Error(`Question not found: ${questionId}`)
      if (!q.answer) throw new Error(`Expected question "${questionId}" to be resolved`)
    },

    summaryCountIs: async (session, { stage, count }) => {
      const summary = await session.ops.getScenarioSummary()
      const actual = (summary as any)[stage]
      if (actual === undefined) throw new Error(`Unknown stage: ${stage}`)
      if (actual !== count)
        throw new Error(`Expected ${stage} count ${count} but got ${actual}`)
    },

    openQuestionCountIs: async (session, { count }) => {
      const summary = await session.ops.getScenarioSummary()
      if (summary.openQuestions !== count)
        throw new Error(`Expected ${count} open questions but got ${summary.openQuestions}`)
    },

    workflowPhaseIs: async (session, { phase }) => {
      const workspace = await session.store.load()
      const actual = detectPhase(workspace).name
      if (actual !== phase)
        throw new Error(`Expected phase "${phase}" but got "${actual}"`)
    },

    advanceCandidateCountIs: async (session, { count }) => {
      const actual = (await session.ops.getAdvanceCandidates()).length
      if (actual !== count)
        throw new Error(`Expected ${count} advance candidates but got ${actual}`)
    },

    markdownContains: async (session, { text }) => {
      const workspace = await session.store.load()
      const md = exportMarkdown(workspace)
      if (!md.includes(text))
        throw new Error(`Expected markdown to contain "${text}"`)
    },

    importResultIs: async (session, { added, skipped }) => {
      if (!session.lastImportResult)
        throw new Error('No import result — was importScenarios called?')
      if (session.lastImportResult.added !== added)
        throw new Error(`Expected ${added} added but got ${session.lastImportResult.added}`)
      if (session.lastImportResult.skipped !== skipped)
        throw new Error(`Expected ${skipped} skipped but got ${session.lastImportResult.skipped}`)
    },

    scenarioSurvivedRoundTrip: async (session, { id, behavior }) => {
      const s = await session.ops.getScenario(id)
      if (!s) throw new Error(`Scenario not found after reload: ${id}`)
      if (s.behavior !== behavior)
        throw new Error(`Expected behavior "${behavior}" but got "${s.behavior}"`)
    },

    scenarioDoesNotExist: async (session, { id }) => {
      const s = await session.ops.getScenario(id)
      if (s) throw new Error(`Expected scenario ${id} to not exist but it does`)
    },

    throwsError: async (session, { message }) => {
      if (!session.lastError)
        throw new Error('Expected an error to have been thrown')
      if (!session.lastError.message.includes(message))
        throw new Error(`Expected error message to contain "${message}" but got "${session.lastError.message}"`)
    },
  },
})
