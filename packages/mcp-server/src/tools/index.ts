import { join } from 'node:path'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { listDomainsHandler, getDomainVocabularyHandler, listAdaptersHandler } from './domains.js'
import { runTestsHandler, getFailureDetailsHandler, getTestTraceHandler } from './execution.js'
import { describeDomainStructureHandler, describeAdapterStructureHandler, getProjectContextHandler } from './scaffolding.js'
import { getRunDiffHandler } from './reporting.js'
import { registerWorkspaceTools } from './workspace.js'
import { RunStore } from '../runs.js'
import { reloadConfig } from '../config.js'
import type { ToolsConfig } from './types.js'

export type { ToolsConfig } from './types.js'

export function registerTools(server: McpServer, config?: ToolsConfig): void {
  registerDomainTools(server)
  const store = config?.runStore ?? new RunStore(join(process.cwd(), '.aver', 'runs'))
  registerExecutionTools(server, store)
  registerScaffoldingTools(server)
  registerReportingTools(server, store)
  registerWorkspaceTools(server, config)
}

function registerDomainTools(server: McpServer): void {
  server.registerTool(
    'list_domains',
    { description: 'List all registered domains with vocabulary summaries' },
    async () => {
      await reloadConfig()
      return { content: [{ type: 'text' as const, text: JSON.stringify(listDomainsHandler(), null, 2) }] }
    },
  )

  server.registerTool(
    'get_domain_vocabulary',
    {
      description: 'Get the full vocabulary (actions, queries, assertions) for a named domain',
      inputSchema: { domain: z.string().describe('Domain name') },
    },
    async ({ domain }) => {
      await reloadConfig()
      const result = getDomainVocabularyHandler(domain)
      if (!result) {
        return { content: [{ type: 'text' as const, text: `Domain "${domain}" not found` }] }
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'list_adapters',
    { description: 'List all registered adapters with their domain and protocol names' },
    async () => {
      await reloadConfig()
      const result = await listAdaptersHandler()
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )
}

function registerExecutionTools(server: McpServer, store: RunStore): void {
  server.registerTool(
    'run_tests',
    {
      description: 'Run the aver test suite and return a summary of results',
      inputSchema: {
        domain: z.string().optional().describe('Filter tests by domain name'),
        adapter: z.string().optional().describe('Filter tests by adapter name'),
      },
    },
    async ({ domain, adapter }) => {
      const summary = runTestsHandler(store, { domain, adapter })
      return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] }
    },
  )

  server.registerTool(
    'get_failure_details',
    {
      description: 'Get detailed failure information from the latest test run',
      inputSchema: {
        domain: z.string().optional().describe('Filter failures by domain name'),
        testName: z.string().optional().describe('Filter failures by test name'),
      },
    },
    async ({ domain, testName }) => {
      const result = getFailureDetailsHandler(store, { domain, testName })
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'get_test_trace',
    {
      description: 'Get the execution trace for a specific test from the latest run',
      inputSchema: {
        testName: z.string().describe('The name of the test to get the trace for'),
      },
    },
    async ({ testName }) => {
      const result = getTestTraceHandler(store, testName)
      if (!result) {
        return { content: [{ type: 'text' as const, text: `Test "${testName}" not found in latest run` }] }
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )
}

function registerScaffoldingTools(server: McpServer): void {
  server.registerTool(
    'get_project_context',
    {
      description: 'Get project structure including config path, domain files, adapter files, test files, and naming conventions. Use this to locate source files before reading them for type signatures.',
    },
    async () => {
      await reloadConfig()
      const result = await getProjectContextHandler()
      if (!result) {
        return { content: [{ type: 'text' as const, text: 'No aver project found. Run aver init or create an aver.config.ts file.' }] }
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'describe_domain_structure',
    {
      description: 'Generate a generic CRUD domain template. Returns a starting-point structure with common actions, queries, and assertions that you can customize.',
      inputSchema: {
        description: z.string().describe('A name for the domain (e.g. "shopping cart") — used to generate a camelCase suggested name'),
      },
    },
    async ({ description }) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(describeDomainStructureHandler(description), null, 2) }],
    }),
  )

  server.registerTool(
    'describe_adapter_structure',
    {
      description: 'Describe the handler structure needed for an adapter given a domain and protocol',
      inputSchema: {
        domain: z.string().describe('Domain name'),
        protocol: z.string().describe('Protocol name'),
      },
    },
    async ({ domain, protocol }) => {
      await reloadConfig()
      const result = describeAdapterStructureHandler(domain, protocol)
      if (!result) {
        return { content: [{ type: 'text' as const, text: `Adapter for domain "${domain}" with protocol "${protocol}" not found` }] }
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )
}

function registerReportingTools(server: McpServer, store: RunStore): void {
  server.registerTool(
    'get_run_diff',
    {
      description: 'Compare the last two test runs and show newly passing, newly failing, and still-failing tests',
    },
    async () => {
      const diff = getRunDiffHandler(store)
      if (!diff) {
        return { content: [{ type: 'text' as const, text: 'Need at least 2 test runs to compare.' }] }
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(diff, null, 2) }] }
    },
  )
}
