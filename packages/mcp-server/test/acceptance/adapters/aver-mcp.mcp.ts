import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import {
  implement,
  defineDomain as realDefineDomain,
  action as realAction,
  query as realQuery,
  assertion as realAssertion,
  registerAdapter,
  resetRegistry,
} from '@aver/core'
import type { Protocol } from '@aver/core'
import { averMcp } from '../domains/aver-mcp'
import { averMcpAdapter } from './aver-mcp.unit'
import { createServer } from '../../../src/server'
import { registerTools } from '../../../src/tools/index'
import { RunStore } from '../../../src/runs'
import { reloadConfig } from '../../../src/config'
import {
  getScenariosHandler,
  getWorkflowPhaseHandler,
} from '../../../src/tools/workspace'

interface McpIntegrationSession {
  client: Client
  runStore: RunStore
  workspaceBasePath: string
  workspaceProjectId: string
  lastCapturedScenario?: { id: string; stage: string; behavior: string }
  lastAddedQuestion?: { id: string; text: string }
  lastImportResult?: { added: number; skipped: number }
}

const mcpProtocol: Protocol<McpIntegrationSession> = {
  name: 'mcp',
  async setup() {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const runStoreDir = mkdtempSync(join(tmpdir(), 'aver-mcp-integ-runs-'))
    const workspaceDir = mkdtempSync(join(tmpdir(), 'aver-mcp-integ-ws-'))
    const runStore = new RunStore(runStoreDir)

    const server = createServer()
    registerTools(server, {
      runStore,
      workspaceBasePath: workspaceDir,
      workspaceProjectId: 'test',
    })
    await server.connect(serverTransport)

    const client = new Client({ name: 'aver-test', version: '0.1.0' })
    await client.connect(clientTransport)

    return { client, runStore, workspaceBasePath: workspaceDir, workspaceProjectId: 'test' }
  },
  async teardown({ client }) {
    await client.close()
  },
}

function parseToolResult(result: any): unknown {
  const text = result.content?.[0]?.text
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export const averMcpIntegrationAdapter = implement(averMcp, {
  protocol: mcpProtocol,

  actions: {
    // --- Fixtures (bypass MCP — manipulate in-process state) ---
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
      registerAdapter(averMcpIntegrationAdapter)
    },

    resetState: async (session) => {
      resetRegistry()
      registerAdapter(averMcpAdapter)
      registerAdapter(averMcpIntegrationAdapter)
      session.lastCapturedScenario = undefined
      session.lastAddedQuestion = undefined
      session.lastImportResult = undefined
    },

    // --- System actions (through MCP transport) ---
    captureScenario: async (session, input) => {
      const result = await session.client.callTool({ name: 'capture_scenario', arguments: input })
      const parsed = parseToolResult(result) as any
      session.lastCapturedScenario = { id: parsed.id, stage: parsed.stage, behavior: parsed.behavior }
    },

    advanceScenario: async (session, input) => {
      await session.client.callTool({ name: 'advance_scenario', arguments: input })
    },

    regressScenario: async (session, input) => {
      await session.client.callTool({ name: 'regress_scenario', arguments: input })
    },

    deleteScenario: async (session, input) => {
      await session.client.callTool({ name: 'delete_scenario', arguments: input })
    },

    addQuestion: async (session, input) => {
      const result = await session.client.callTool({ name: 'add_question', arguments: input })
      const parsed = parseToolResult(result) as any
      session.lastAddedQuestion = { id: parsed.id, text: parsed.text }
    },

    resolveQuestion: async (session, input) => {
      await session.client.callTool({ name: 'resolve_question', arguments: input })
    },

    linkToDomain: async (session, input) => {
      await session.client.callTool({ name: 'link_to_domain', arguments: input })
    },

    importScenarios: async (session, input) => {
      const result = await session.client.callTool({ name: 'import_scenarios', arguments: input })
      const parsed = parseToolResult(result) as any
      session.lastImportResult = { added: parsed.added, skipped: parsed.skipped }
    },
  },

  queries: {
    // --- System queries (through MCP transport) ---
    domainList: async ({ client }) => {
      const result = await client.callTool({ name: 'list_domains', arguments: {} })
      return parseToolResult(result) as any
    },

    domainVocabulary: async ({ client }, { name }) => {
      const result = await client.callTool({ name: 'get_domain_vocabulary', arguments: { domain: name } })
      const parsed = parseToolResult(result)
      return typeof parsed === 'string' ? null : parsed as any
    },

    adapterList: async ({ client }) => {
      const result = await client.callTool({ name: 'list_adapters', arguments: {} })
      return parseToolResult(result) as any
    },

    failureDetails: async ({ client }, input) => {
      const args: Record<string, string> = {}
      if (input?.domain) args.domain = input.domain
      if (input?.testName) args.testName = input.testName
      const result = await client.callTool({ name: 'get_failure_details', arguments: args })
      return parseToolResult(result) as any
    },

    testTrace: async ({ client }, { testName }) => {
      const result = await client.callTool({ name: 'get_test_trace', arguments: { testName } })
      const parsed = parseToolResult(result)
      return typeof parsed === 'string' ? null : parsed as any
    },

    runDiff: async ({ client }) => {
      const result = await client.callTool({ name: 'get_run_diff', arguments: {} })
      const parsed = parseToolResult(result)
      return typeof parsed === 'string' ? null : parsed as any
    },

    domainStructure: async ({ client }, { description }) => {
      const result = await client.callTool({ name: 'describe_domain_structure', arguments: { description } })
      return parseToolResult(result) as any
    },

    adapterStructure: async ({ client }, { domain, protocol }) => {
      const result = await client.callTool({ name: 'describe_adapter_structure', arguments: { domain, protocol } })
      const parsed = parseToolResult(result)
      return typeof parsed === 'string' ? null : parsed as any
    },

    projectContext: async ({ client }) => {
      const result = await client.callTool({ name: 'get_project_context', arguments: {} })
      const parsed = parseToolResult(result)
      return typeof parsed === 'string' ? null : parsed as any
    },

    scenarioSummary: async ({ client }) => {
      const result = await client.callTool({ name: 'get_scenario_summary', arguments: {} })
      return parseToolResult(result) as any
    },

    scenarios: async ({ client }, input) => {
      const args: Record<string, string> = {}
      if (input?.stage) args.stage = input.stage
      if (input?.story) args.story = input.story
      if (input?.keyword) args.keyword = input.keyword
      const result = await client.callTool({ name: 'get_scenarios', arguments: args })
      const parsed = parseToolResult(result) as any[]
      return parsed.map((s: any) => ({
        id: s.id,
        stage: s.stage,
        behavior: s.behavior,
        domainOperation: s.domainOperation,
      }))
    },

    advanceCandidates: async ({ client }) => {
      const result = await client.callTool({ name: 'get_advance_candidates', arguments: {} })
      const parsed = parseToolResult(result) as any[]
      return parsed.map((s: any) => ({ id: s.id, stage: s.stage }))
    },

    workflowPhase: async ({ client }) => {
      const result = await client.callTool({ name: 'get_workflow_phase', arguments: {} })
      return parseToolResult(result) as any
    },

    exportedScenarios: async ({ client }, { format }) => {
      const result = await client.callTool({ name: 'export_scenarios', arguments: { format } })
      // export_scenarios returns raw text, not JSON
      const text = (result as any).content?.[0]?.text
      return text ?? ''
    },

    // --- Test-support queries ---
    runCount: async (session) => {
      return session.runStore.listRuns().length
    },

    registeredDomainCount: async ({ client }) => {
      const result = await client.callTool({ name: 'list_domains', arguments: {} })
      const parsed = parseToolResult(result) as any[]
      return parsed.length
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
    domainIsRegistered: async ({ client }, { name }) => {
      const result = await client.callTool({ name: 'list_domains', arguments: {} })
      const domains = parseToolResult(result) as any[]
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
