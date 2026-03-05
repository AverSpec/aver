import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { implement } from '@aver/core'
import type { Protocol } from '@aver/core'
import { averWorkspace } from '../../../../workspace/test/acceptance/domains/aver-workspace'
import { createServer } from '../../../src/server'
import { registerTools } from '../../../src/tools/index'
import { RunStore } from '../../../src/runs'
import { createOtelCollector } from '../../../../workspace/test/support/otel-collector.js'

interface WorkspaceMcpSession {
  client: Client
  lastError?: Error
  lastImportResult?: { added: number; skipped: number }
  lastFilterResult: number
}

const { collector, shutdown } = createOtelCollector()

const mcpProtocol: Protocol<WorkspaceMcpSession> = {
  name: 'mcp',
  async setup() {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const runStoreDir = mkdtempSync(join(tmpdir(), 'aver-ws-mcp-runs-'))
    const workspaceDir = mkdtempSync(join(tmpdir(), 'aver-ws-mcp-ws-'))
    const runStore = new RunStore(runStoreDir)

    const server = createServer()
    registerTools(server, {
      runStore,
      workspaceBasePath: workspaceDir,
      workspaceProjectId: 'test',
    })
    await server.connect(serverTransport)

    const client = new Client({ name: 'aver-workspace-test', version: '0.1.0' })
    await client.connect(clientTransport)

    return { client, lastFilterResult: 0 }
  },
  async teardown({ client }) {
    await client.close()
    await shutdown()
  },
  telemetry: collector,
}

function parseToolResult(result: any): unknown {
  const text = result.content?.[0]?.text
  if (!text) return null
  const trimmed = text.trimStart()
  if (trimmed[0] === '{' || trimmed[0] === '[') {
    try {
      return JSON.parse(text)
    } catch (e) {
      throw new Error(`Failed to parse MCP tool result as JSON: ${(e as Error).message}\nRaw text: ${text.slice(0, 200)}`)
    }
  }
  return text
}

export const averWorkspaceMcpAdapter = implement(averWorkspace, {
  protocol: mcpProtocol,

  actions: {
    captureScenario: async (session, input) => {
      try {
        session.lastError = undefined
        await session.client.callTool({ name: 'capture_scenario', arguments: input })
      } catch (e: any) {
        session.lastError = e
      }
    },

    updateScenario: async (session, input) => {
      try {
        session.lastError = undefined
        await session.client.callTool({ name: 'update_scenario', arguments: input })
      } catch (e: any) {
        session.lastError = e
      }
    },

    advanceScenario: async (session, input) => {
      try {
        session.lastError = undefined
        await session.client.callTool({ name: 'advance_scenario', arguments: input })
      } catch (e: any) {
        session.lastError = e
      }
    },

    revisitScenario: async (session, input) => {
      try {
        session.lastError = undefined
        await session.client.callTool({ name: 'revisit_scenario', arguments: input })
      } catch (e: any) {
        session.lastError = e
      }
    },

    confirmScenario: async (session, input) => {
      try {
        session.lastError = undefined
        await session.client.callTool({ name: 'confirm_scenario', arguments: input })
      } catch (e: any) {
        session.lastError = e
      }
    },

    deleteScenario: async (session, input) => {
      try {
        session.lastError = undefined
        await session.client.callTool({ name: 'delete_scenario', arguments: input })
      } catch (e: any) {
        session.lastError = e
      }
    },

    addQuestion: async (session, input) => {
      try {
        session.lastError = undefined
        await session.client.callTool({ name: 'add_question', arguments: input })
      } catch (e: any) {
        session.lastError = e
      }
    },

    resolveQuestion: async (session, input) => {
      try {
        session.lastError = undefined
        await session.client.callTool({ name: 'resolve_question', arguments: input })
      } catch (e: any) {
        session.lastError = e
      }
    },

    linkToDomain: async (session, input) => {
      try {
        session.lastError = undefined
        await session.client.callTool({ name: 'link_to_domain', arguments: input })
      } catch (e: any) {
        session.lastError = e
      }
    },

    importScenarios: async (session, input) => {
      try {
        session.lastError = undefined
        const result = await session.client.callTool({ name: 'import_scenarios', arguments: input })
        const parsed = parseToolResult(result) as any
        session.lastImportResult = { added: parsed.added, skipped: parsed.skipped }
      } catch (e: any) {
        session.lastError = e
      }
    },
  },

  queries: {
    scenarioSummary: async ({ client }) => {
      const result = await client.callTool({ name: 'get_scenario_summary', arguments: {} })
      return parseToolResult(result) as any
    },

    scenarios: async (session, filters) => {
      const args: Record<string, any> = {}
      if (filters) {
        if (filters.stage) args.stage = filters.stage
        if (filters.story) args.story = filters.story
        if (filters.keyword) args.keyword = filters.keyword
        if (filters.mode) args.mode = filters.mode
        if (filters.hasConfirmation !== undefined) args.hasConfirmation = filters.hasConfirmation
        if (filters.domainOperation) args.domainOperation = filters.domainOperation
        if (filters.hasOpenQuestions !== undefined) args.hasOpenQuestions = filters.hasOpenQuestions
        if (filters.fields) args.fields = filters.fields
      }
      const result = await session.client.callTool({ name: 'get_scenarios', arguments: args })
      const parsed = parseToolResult(result) as any[]
      session.lastFilterResult = parsed.length
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
      const text = (result as any).content?.[0]?.text
      return text ?? ''
    },
  },

  assertions: {
    scenarioIsAt: async ({ client }, { id, stage }) => {
      const result = await client.callTool({ name: 'get_scenarios', arguments: {} })
      const scenarios = parseToolResult(result) as any[]
      const s = scenarios.find((s: any) => s.id === id)
      expect(s).toBeDefined()
      expect(s.stage).toBe(stage)
    },

    scenarioHasBehavior: async ({ client }, { id, behavior }) => {
      const result = await client.callTool({ name: 'get_scenarios', arguments: {} })
      const scenarios = parseToolResult(result) as any[]
      const s = scenarios.find((s: any) => s.id === id)
      expect(s).toBeDefined()
      expect(s.behavior).toBe(behavior)
    },

    scenarioHasConfirmation: async ({ client }, { id, confirmer }) => {
      const result = await client.callTool({ name: 'get_scenarios', arguments: {} })
      const scenarios = parseToolResult(result) as any[]
      const s = scenarios.find((s: any) => s.id === id)
      expect(s).toBeDefined()
      expect(s.confirmedBy).toBe(confirmer)
    },

    confirmationCleared: async ({ client }, { id }) => {
      const result = await client.callTool({ name: 'get_scenarios', arguments: {} })
      const scenarios = parseToolResult(result) as any[]
      const s = scenarios.find((s: any) => s.id === id)
      expect(s).toBeDefined()
      expect(s.confirmedBy).toBeFalsy()
    },

    advancementBlocked: async (session, { id: _id, reason }) => {
      expect(session.lastError).toBeDefined()
      expect(session.lastError!.message).toContain(reason)
    },

    advancementSucceeded: async (session, { id, to }) => {
      expect(session.lastError).toBeUndefined()
      const result = await session.client.callTool({ name: 'get_scenarios', arguments: {} })
      const scenarios = parseToolResult(result) as any[]
      const s = scenarios.find((s: any) => s.id === id)
      expect(s).toBeDefined()
      expect(s.stage).toBe(to)
    },

    transitionRecorded: async ({ client }, { id, from, to, by }) => {
      const result = await client.callTool({ name: 'get_scenarios', arguments: {} })
      const scenarios = parseToolResult(result) as any[]
      const s = scenarios.find((s: any) => s.id === id)
      expect(s).toBeDefined()
      const match = s.transitions?.find((t: any) => t.from === from && t.to === to && t.by === by)
      expect(match).toBeDefined()
    },

    questionExists: async ({ client }, { scenarioId, text }) => {
      const result = await client.callTool({ name: 'get_scenarios', arguments: {} })
      const scenarios = parseToolResult(result) as any[]
      const s = scenarios.find((s: any) => s.id === scenarioId)
      expect(s).toBeDefined()
      const q = s.questions?.find((q: any) => q.text === text)
      expect(q).toBeDefined()
    },

    questionResolved: async ({ client }, { scenarioId, questionId, answer }) => {
      const result = await client.callTool({ name: 'get_scenarios', arguments: {} })
      const scenarios = parseToolResult(result) as any[]
      const s = scenarios.find((s: any) => s.id === scenarioId)
      expect(s).toBeDefined()
      const q = s.questions?.find((q: any) => q.id === questionId)
      expect(q).toBeDefined()
      expect(q.answer).toBe(answer)
      expect(q.resolvedAt).toBeDefined()
    },

    domainLinksAre: async ({ client }, { id, domainOperation, testNames }) => {
      const result = await client.callTool({ name: 'get_scenarios', arguments: {} })
      const scenarios = parseToolResult(result) as any[]
      const s = scenarios.find((s: any) => s.id === id)
      expect(s).toBeDefined()
      if (domainOperation !== undefined) {
        expect(s.domainOperation).toBe(domainOperation)
      }
      if (testNames !== undefined) {
        expect([...(s.testNames ?? [])].sort()).toEqual([...testNames].sort())
      }
    },

    scenarioCountIs: async ({ client }, { count }) => {
      const result = await client.callTool({ name: 'get_scenarios', arguments: {} })
      const scenarios = parseToolResult(result) as any[]
      expect(scenarios.length).toBe(count)
    },

    stageCountIs: async ({ client }, { stage, count }) => {
      const result = await client.callTool({ name: 'get_scenario_summary', arguments: {} })
      const summary = parseToolResult(result) as any
      expect(summary[stage]).toBe(count)
    },

    filterReturns: async (session, { count }) => {
      expect(session.lastFilterResult).toBe(count)
    },

    importResultIs: async (session, { added, skipped }) => {
      expect(session.lastImportResult).toBeDefined()
      expect(session.lastImportResult!.added).toBe(added)
      expect(session.lastImportResult!.skipped).toBe(skipped)
    },

    exportContains: async ({ client }, { format, text }) => {
      const result = await client.callTool({ name: 'export_scenarios', arguments: { format } })
      const exported = (result as any).content?.[0]?.text ?? ''
      expect(exported).toContain(text)
    },

    operationFailed: async (session, { message }) => {
      expect(session.lastError).toBeDefined()
      expect(session.lastError!.message).toContain(message)
    },
  },
})
