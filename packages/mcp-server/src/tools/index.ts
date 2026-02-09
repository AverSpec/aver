import { join } from 'node:path'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { listDomainsHandler, getDomainVocabularyHandler, listAdaptersHandler } from './domains.js'
import { runTestsHandler, getFailureDetailsHandler, getTestTraceHandler } from './execution.js'
import { RunStore } from '../runs.js'

export function registerTools(server: McpServer): void {
  registerDomainTools(server)
  const store = new RunStore(join(process.cwd(), '.aver', 'runs'))
  registerExecutionTools(server, store)
}

function registerDomainTools(server: McpServer): void {
  server.registerTool(
    'list_domains',
    { description: 'List all registered domains with vocabulary summaries' },
    async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify(listDomainsHandler(), null, 2) }],
    }),
  )

  server.registerTool(
    'get_domain_vocabulary',
    {
      description: 'Get the full vocabulary (actions, queries, assertions) for a named domain',
      inputSchema: { domain: z.string().describe('Domain name') },
    },
    async ({ domain }) => {
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
    async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify(listAdaptersHandler(), null, 2) }],
    }),
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
