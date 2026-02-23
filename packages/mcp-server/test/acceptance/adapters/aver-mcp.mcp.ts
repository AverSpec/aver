import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import {
  implement,
} from '@aver/core'
import type { Protocol } from '@aver/core'
import { averMcp } from '../domains/aver-mcp'
import { averMcpAdapter } from './aver-mcp.unit'
import { createServer } from '../../../src/server'
import { registerTools } from '../../../src/tools/index'
import { RunStore } from '../../../src/runs'
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
  assertScenarioHasRegressionRationale,
  assertQuestionIsResolved,
  assertScenarioHasDomainOperation,
  assertImportResultIs,
  assertWorkflowPhaseIs,
  assertScenarioCountIs,
} from './shared-fixtures'

interface McpIntegrationSession extends SharedSessionFields {
  client: Client
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
    registerTestDomain: async (_session, input) => registerTestDomainAction(_session, input),
    saveTestRun: async (session, input) => saveTestRunAction(session, input),
    saveMultipleRuns: async (session, input) => saveMultipleRunsAction(session, input),
    reloadConfig: async (_session, input) => reloadConfigAction(_session, input),
    discoverDomains: async (_session, input) => discoverDomainsAction(_session, input, [averMcpAdapter, averMcpIntegrationAdapter]),
    resetState: async (session) => resetStateAction(session, [averMcpAdapter, averMcpIntegrationAdapter]),

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
    runCount: async (session) => queryRunCount(session),

    registeredDomainCount: async ({ client }) => {
      const result = await client.callTool({ name: 'list_domains', arguments: {} })
      const parsed = parseToolResult(result) as any[]
      return parsed.length
    },

    lastCapturedScenario: async (session) => queryLastCapturedScenario(session),
    lastAddedQuestion: async (session) => queryLastAddedQuestion(session),
    importResult: async (session) => queryImportResult(session),
  },

  assertions: {
    domainIsRegistered: async ({ client }, { name }) => {
      const result = await client.callTool({ name: 'list_domains', arguments: {} })
      const domains = parseToolResult(result) as any[]
      const found = domains.find((d: any) => d.name === name)
      if (!found)
        throw new Error(`Expected domain "${name}" to be registered but found: ${domains.map((d: any) => d.name).join(', ')}`)
    },

    runCountIs: async (session, input) => assertRunCountIs(session, input),
    scenarioHasStage: async (session, input) => assertScenarioHasStage(session, input),
    scenarioHasRegressionRationale: async (session, input) => assertScenarioHasRegressionRationale(session, input),
    questionIsResolved: async (session, input) => assertQuestionIsResolved(session, input),
    scenarioHasDomainOperation: async (session, input) => assertScenarioHasDomainOperation(session, input),
    importResultIs: async (session, input) => assertImportResultIs(session, input),
    workflowPhaseIs: async (session, input) => assertWorkflowPhaseIs(session, input),
    scenarioCountIs: async (session, input) => assertScenarioCountIs(session, input),
  },
})
