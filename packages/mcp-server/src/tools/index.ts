import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { listDomainsHandler, getDomainVocabularyHandler, listAdaptersHandler } from './domains.js'

export function registerTools(server: McpServer): void {
  registerDomainTools(server)
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
