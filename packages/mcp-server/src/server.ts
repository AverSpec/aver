import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { log } from './logger.js'

export function createServer(): McpServer {
  return new McpServer({
    name: 'aver',
    version: '0.1.0',
  })
}

export async function startServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  log('info', 'aver MCP server running on stdio')
}
