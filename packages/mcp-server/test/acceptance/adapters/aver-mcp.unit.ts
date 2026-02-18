import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  implement,
  defineDomain as realDefineDomain,
  action as realAction,
  query as realQuery,
  assertion as realAssertion,
  unit,
  registerAdapter,
  resetRegistry,
} from '@aver/core'
import type { Protocol } from '@aver/core'
import { averMcp } from '../domains/aver-mcp'
import { reloadConfig } from '../../../src/config'
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
  regressScenarioHandler,
  deleteScenarioHandler,
  addQuestionHandler,
  resolveQuestionHandler,
  linkToDomainHandler,
  getWorkflowPhaseHandler,
  getAdvanceCandidatesHandler,
  exportScenariosHandler,
  importScenariosHandler,
} from '../../../src/tools/workspace'

interface McpUnitSession {
  runStore: RunStore
  workspaceBasePath: string
  workspaceProjectId: string
  lastCapturedScenario?: { id: string; stage: string; behavior: string }
  lastAddedQuestion?: { id: string; text: string }
  lastImportResult?: { added: number; skipped: number }
}

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
    registerTestDomain: async (_session, { name, actions, queries, assertions }) => {
      const actionMarkers: Record<string, any> = {}
      for (const a of actions) actionMarkers[a] = realAction()

      const queryMarkers: Record<string, any> = {}
      for (const q of queries) queryMarkers[q] = realQuery()

      const assertionMarkers: Record<string, any> = {}
      for (const a of assertions) assertionMarkers[a] = realAssertion()

      const domain = realDefineDomain({
        name,
        actions: actionMarkers,
        queries: queryMarkers,
        assertions: assertionMarkers,
      })

      const proto: Protocol<null> = {
        name: 'test-inner',
        async setup() { return null },
        async teardown() {},
      }

      const adapter = implement(domain as any, {
        protocol: proto,
        actions: Object.fromEntries(Object.keys(actionMarkers).map(k => [k, async () => {}])),
        queries: Object.fromEntries(Object.keys(queryMarkers).map(k => [k, async () => `result:${k}`])),
        assertions: Object.fromEntries(Object.keys(assertionMarkers).map(k => [k, async () => {}])),
      })

      registerAdapter(adapter)
    },

    saveTestRun: async (session, { results }) => {
      session.runStore.save({
        timestamp: new Date().toISOString(),
        results,
      })
    },

    saveMultipleRuns: async (session, { count }) => {
      for (let i = 0; i < count; i++) {
        session.runStore.save({
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          results: [{ testName: `test-${i}`, domain: 'Test', status: 'pass', trace: [] }],
        })
      }
    },

    reloadConfig: async (_session, { domainNames }) => {
      await reloadConfig(async () => {
        for (const name of domainNames) {
          const domain = realDefineDomain({
            name,
            actions: {},
            queries: {},
            assertions: {},
          })
          registerAdapter(implement(domain as any, {
            protocol: { name: 'test-inner', async setup() { return null }, async teardown() {} } as any,
            actions: {},
            queries: {},
            assertions: {},
          }))
        }
      })
    },

    discoverDomains: async (_session, { domainNames }) => {
      resetRegistry()
      for (const name of domainNames) {
        const domain = realDefineDomain({
          name,
          actions: {},
          queries: {},
          assertions: {},
        })
        registerAdapter(implement(domain as any, {
          protocol: { name: 'test-inner', async setup() { return null }, async teardown() {} } as any,
          actions: {},
          queries: {},
          assertions: {},
        }))
      }
      registerAdapter(averMcpAdapter)
    },

    resetState: async (session) => {
      resetRegistry()
      registerAdapter(averMcpAdapter)
      session.lastCapturedScenario = undefined
      session.lastAddedQuestion = undefined
      session.lastImportResult = undefined
    },

    // --- System actions ---
    captureScenario: async (session, input) => {
      const result = captureScenarioHandler(input, session.workspaceBasePath, session.workspaceProjectId)
      session.lastCapturedScenario = { id: result.id, stage: result.stage, behavior: result.behavior }
    },

    advanceScenario: async (session, input) => {
      advanceScenarioHandler(input, session.workspaceBasePath, session.workspaceProjectId)
    },

    regressScenario: async (session, input) => {
      regressScenarioHandler(
        { id: input.id, targetStage: input.targetStage as any, rationale: input.rationale },
        session.workspaceBasePath,
        session.workspaceProjectId,
      )
    },

    deleteScenario: async (session, input) => {
      deleteScenarioHandler(input, session.workspaceBasePath, session.workspaceProjectId)
    },

    addQuestion: async (session, input) => {
      const result = addQuestionHandler(input, session.workspaceBasePath, session.workspaceProjectId)
      session.lastAddedQuestion = { id: result.id, text: result.text }
    },

    resolveQuestion: async (session, input) => {
      resolveQuestionHandler(input, session.workspaceBasePath, session.workspaceProjectId)
    },

    linkToDomain: async (session, input) => {
      linkToDomainHandler(input, session.workspaceBasePath, session.workspaceProjectId)
    },

    importScenarios: async (session, input) => {
      const result = importScenariosHandler(input, session.workspaceBasePath, session.workspaceProjectId)
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
      const results = getScenariosHandler(input ?? {}, session.workspaceBasePath, session.workspaceProjectId)
      return results.map(s => ({
        id: s.id,
        stage: s.stage,
        behavior: s.behavior,
        domainOperation: s.domainOperation,
      }))
    },

    advanceCandidates: async (session) => {
      const results = getAdvanceCandidatesHandler(session.workspaceBasePath, session.workspaceProjectId)
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
    runCount: async (session) => {
      return session.runStore.listRuns().length
    },

    registeredDomainCount: async () => {
      return listDomainsHandler().length
    },

    lastCapturedScenario: async (session) => {
      if (!session.lastCapturedScenario) throw new Error('No scenario has been captured yet')
      return session.lastCapturedScenario
    },

    lastAddedQuestion: async (session) => {
      if (!session.lastAddedQuestion) throw new Error('No question has been added yet')
      return session.lastAddedQuestion
    },

    importResult: async (session) => {
      if (!session.lastImportResult) throw new Error('No import has been performed yet')
      return session.lastImportResult
    },
  },

  assertions: {
    domainIsRegistered: async (_session, { name }) => {
      const domains = listDomainsHandler()
      const found = domains.find((d: any) => d.name === name)
      if (!found)
        throw new Error(`Expected domain "${name}" to be registered but found: ${domains.map((d: any) => d.name).join(', ')}`)
    },

    runCountIs: async (session, { count }) => {
      const actual = session.runStore.listRuns().length
      if (actual !== count)
        throw new Error(`Expected ${count} runs but got ${actual}`)
    },

    scenarioHasStage: async (session, { id, stage }) => {
      const scenarios = getScenariosHandler({}, session.workspaceBasePath, session.workspaceProjectId)
      const scenario = scenarios.find(s => s.id === id)
      if (!scenario) throw new Error(`Scenario "${id}" not found`)
      if (scenario.stage !== stage)
        throw new Error(`Expected scenario "${id}" to have stage "${stage}" but got "${scenario.stage}"`)
    },

    scenarioHasRegressionRationale: async (session, { id, rationale }) => {
      const scenarios = getScenariosHandler({}, session.workspaceBasePath, session.workspaceProjectId)
      const scenario = scenarios.find(s => s.id === id)
      if (!scenario) throw new Error(`Scenario "${id}" not found`)
      if (scenario.regressionRationale !== rationale)
        throw new Error(`Expected regression rationale "${rationale}" but got "${scenario.regressionRationale}"`)
    },

    questionIsResolved: async (session, { scenarioId, questionId }) => {
      const scenarios = getScenariosHandler({}, session.workspaceBasePath, session.workspaceProjectId)
      const scenario = scenarios.find(s => s.id === scenarioId)
      if (!scenario) throw new Error(`Scenario "${scenarioId}" not found`)
      const question = scenario.questions?.find(q => q.id === questionId)
      if (!question) throw new Error(`Question "${questionId}" not found on scenario "${scenarioId}"`)
      if (!question.resolvedAt)
        throw new Error(`Question "${questionId}" is not resolved`)
    },

    scenarioHasDomainOperation: async (session, { id, operation }) => {
      const scenarios = getScenariosHandler({}, session.workspaceBasePath, session.workspaceProjectId)
      const scenario = scenarios.find(s => s.id === id)
      if (!scenario) throw new Error(`Scenario "${id}" not found`)
      if (scenario.domainOperation !== operation)
        throw new Error(`Expected domain operation "${operation}" but got "${scenario.domainOperation}"`)
    },

    importResultIs: async (session, { added, skipped }) => {
      if (!session.lastImportResult) throw new Error('No import has been performed yet')
      if (session.lastImportResult.added !== added || session.lastImportResult.skipped !== skipped)
        throw new Error(`Expected import result { added: ${added}, skipped: ${skipped} } but got ${JSON.stringify(session.lastImportResult)}`)
    },

    workflowPhaseIs: async (session, { phase }) => {
      const result = getWorkflowPhaseHandler(session.workspaceBasePath, session.workspaceProjectId)
      if (result.name !== phase)
        throw new Error(`Expected workflow phase "${phase}" but got "${result.name}"`)
    },

    scenarioCountIs: async (session, { count }) => {
      const scenarios = getScenariosHandler({}, session.workspaceBasePath, session.workspaceProjectId)
      if (scenarios.length !== count)
        throw new Error(`Expected ${count} scenarios but got ${scenarios.length}`)
    },
  },
})
