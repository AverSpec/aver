import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  implement,
  unit,
  registerAdapter,
} from '@aver/core'
import { averMcp } from '../domains/aver-mcp'
import {
  listDomainsHandler,
  getDomainVocabularyHandler,
  listAdaptersHandler,
} from '../../../src/tools/domains'
import { RunStore } from '../../../src/runs'
import {
  getFailureDetailsHandler,
  getTestTraceHandler,
} from '../../../src/tools/execution'
import {
  describeDomainStructureHandler,
  describeAdapterStructureHandler,
  getProjectContextHandler,
} from '../../../src/tools/scaffolding'
import { getRunDiffHandler } from '../../../src/tools/reporting'
import {
  captureScenarioHandler,
  getScenarioSummaryHandler,
  getScenariosHandler,
  advanceScenarioHandler,
  revisitScenarioHandler,
  deleteScenarioHandler,
  addQuestionHandler,
  resolveQuestionHandler,
  linkToDomainHandler,
  getWorkflowPhaseHandler,
  getAdvanceCandidatesHandler,
  exportScenariosHandler,
  importScenariosHandler,
} from '../../../src/tools/workspace'
import type { SharedSessionFields } from './shared-fixtures'
import {
  registerTestDomainAction,
  saveTestRunAction,
  saveMultipleRunsAction,
  reloadConfigAction,
  discoverDomainsAction,
  resetStateAction,
  queryRunCount,
  queryLastCapturedScenario,
  queryLastAddedQuestion,
  queryImportResult,
  assertRunCountIs,
  assertScenarioHasStage,
  assertScenarioHasRevisitRationale,
  assertQuestionIsResolved,
  assertScenarioHasDomainOperation,
  assertImportResultIs,
  assertWorkflowPhaseIs,
  assertScenarioCountIs,
} from './shared-fixtures'

interface McpUnitSession extends SharedSessionFields {}

export const averMcpAdapter = implement(averMcp, {
  protocol: unit<McpUnitSession>(() => {
    const runStoreDir = mkdtempSync(join(tmpdir(), 'aver-mcp-test-'))
    const workspaceDir = mkdtempSync(join(tmpdir(), 'aver-mcp-workspace-'))
    return {
      runStore: new RunStore(runStoreDir),
      workspaceBasePath: workspaceDir,
      workspaceProjectId: 'test',
    }
  }),

  actions: {
    // --- Fixtures ---
    registerTestDomain: async (_session, input) => registerTestDomainAction(_session, input),
    saveTestRun: async (session, input) => saveTestRunAction(session, input),
    saveMultipleRuns: async (session, input) => saveMultipleRunsAction(session, input),
    reloadConfig: async (_session, input) => reloadConfigAction(_session, input),
    discoverDomains: async (_session, input) => discoverDomainsAction(_session, input, [averMcpAdapter]),
    resetState: async (session) => resetStateAction(session, [averMcpAdapter]),

    // --- System actions ---
    captureScenario: async (session, input) => {
      const result = await captureScenarioHandler(input, session.workspaceBasePath, session.workspaceProjectId)
      session.lastCapturedScenario = { id: result.id, stage: result.stage, behavior: result.behavior }
    },

    advanceScenario: async (session, input) => {
      await advanceScenarioHandler(input, session.workspaceBasePath, session.workspaceProjectId)
    },

    revisitScenario: async (session, input) => {
      await revisitScenarioHandler(
        { id: input.id, targetStage: input.targetStage as any, rationale: input.rationale },
        session.workspaceBasePath,
        session.workspaceProjectId,
      )
    },

    deleteScenario: async (session, input) => {
      await deleteScenarioHandler(input, session.workspaceBasePath, session.workspaceProjectId)
    },

    addQuestion: async (session, input) => {
      const result = await addQuestionHandler(input, session.workspaceBasePath, session.workspaceProjectId)
      session.lastAddedQuestion = { id: result.id, text: result.text }
    },

    resolveQuestion: async (session, input) => {
      await resolveQuestionHandler(input, session.workspaceBasePath, session.workspaceProjectId)
    },

    linkToDomain: async (session, input) => {
      await linkToDomainHandler(input, session.workspaceBasePath, session.workspaceProjectId)
    },

    importScenarios: async (session, input) => {
      const result = await importScenariosHandler(input, session.workspaceBasePath, session.workspaceProjectId)
      session.lastImportResult = result
    },
  },

  queries: {
    // --- System queries ---
    domainList: async () => listDomainsHandler(),

    domainVocabulary: async (_, { name }) => getDomainVocabularyHandler(name) ?? null,

    adapterList: async () => await listAdaptersHandler(),

    failureDetails: async (session, input) => {
      return getFailureDetailsHandler(session.runStore, input ?? {})
    },

    testTrace: async (session, { testName }) => {
      return getTestTraceHandler(session.runStore, testName) ?? null
    },

    runDiff: async (session) => {
      return getRunDiffHandler(session.runStore) ?? null
    },

    domainStructure: async (_, { description }) => {
      return describeDomainStructureHandler(description)
    },

    adapterStructure: async (_, { domain, protocol }) => {
      return describeAdapterStructureHandler(domain, protocol) ?? null
    },

    projectContext: async () => {
      return await getProjectContextHandler() ?? null
    },

    scenarioSummary: async (session) => {
      return getScenarioSummaryHandler(session.workspaceBasePath, session.workspaceProjectId)
    },

    scenarios: async (session, input) => {
      const results = await getScenariosHandler(input ?? {}, session.workspaceBasePath, session.workspaceProjectId)
      return results.map(s => ({
        id: s.id,
        stage: s.stage,
        behavior: s.behavior,
        domainOperation: s.domainOperation,
      }))
    },

    advanceCandidates: async (session) => {
      const results = await getAdvanceCandidatesHandler(session.workspaceBasePath, session.workspaceProjectId)
      return results.map(s => ({ id: s.id, stage: s.stage }))
    },

    workflowPhase: async (session) => {
      return getWorkflowPhaseHandler(session.workspaceBasePath, session.workspaceProjectId)
    },

    exportedScenarios: async (session, { format }) => {
      return exportScenariosHandler(
        { format: format as 'markdown' | 'json' },
        session.workspaceBasePath,
        session.workspaceProjectId,
      )
    },

    // --- Test-support queries ---
    runCount: async (session) => queryRunCount(session),

    registeredDomainCount: async () => {
      return listDomainsHandler().length
    },

    lastCapturedScenario: async (session) => queryLastCapturedScenario(session),
    lastAddedQuestion: async (session) => queryLastAddedQuestion(session),
    importResult: async (session) => queryImportResult(session),
  },

  assertions: {
    domainIsRegistered: async (_session, { name }) => {
      const domains = listDomainsHandler()
      const found = domains.find((d: any) => d.name === name)
      if (!found)
        throw new Error(`Expected domain "${name}" to be registered but found: ${domains.map((d: any) => d.name).join(', ')}`)
    },

    runCountIs: async (session, input) => assertRunCountIs(session, input),
    scenarioHasStage: async (session, input) => assertScenarioHasStage(session, input),
    scenarioHasRevisitRationale: async (session, input) => assertScenarioHasRevisitRationale(session, input),
    questionIsResolved: async (session, input) => assertQuestionIsResolved(session, input),
    scenarioHasDomainOperation: async (session, input) => assertScenarioHasDomainOperation(session, input),
    importResultIs: async (session, input) => assertImportResultIs(session, input),
    workflowPhaseIs: async (session, input) => assertWorkflowPhaseIs(session, input),
    scenarioCountIs: async (session, input) => assertScenarioCountIs(session, input),
  },
})
