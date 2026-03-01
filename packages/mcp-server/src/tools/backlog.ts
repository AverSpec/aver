import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  BacklogOps,
  type BacklogItem,
  type BacklogSummary,
} from '@aver/workspace'
import type { ToolsConfig } from './types.js'
import { setToolsConfig, resolveBasePath, resolveProjectId, getCachedStore } from './workspace-helpers.js'

// --- Helpers ---

function createBacklogOps(basePath: string, projectId: string): BacklogOps {
  return new BacklogOps(getCachedStore(basePath, projectId))
}

// --- Handler functions (async, no MCP dependency) ---

export async function createBacklogItemHandler(
  input: {
    title: string
    description?: string
    priority?: 'P0' | 'P1' | 'P2' | 'P3'
    type?: 'feature' | 'bug' | 'research' | 'refactor' | 'chore'
    tags?: string[]
    references?: Array<{ label: string; path: string }>
    externalUrl?: string
    scenarioIds?: string[]
  },
  basePath: string,
  projectId: string,
): Promise<BacklogItem> {
  return createBacklogOps(basePath, projectId).createItem(input)
}

export async function updateBacklogItemHandler(
  input: {
    id: string
    title?: string
    description?: string
    status?: 'open' | 'in-progress' | 'done' | 'dismissed'
    priority?: 'P0' | 'P1' | 'P2' | 'P3'
    type?: 'feature' | 'bug' | 'research' | 'refactor' | 'chore'
    tags?: string[]
    references?: Array<{ label: string; path: string }>
    externalUrl?: string
    scenarioIds?: string[]
  },
  basePath: string,
  projectId: string,
): Promise<BacklogItem> {
  const { id, ...updates } = input
  return createBacklogOps(basePath, projectId).updateItem(id, updates)
}

export async function deleteBacklogItemHandler(
  input: { id: string },
  basePath: string,
  projectId: string,
): Promise<void> {
  await createBacklogOps(basePath, projectId).deleteItem(input.id)
}

export async function getBacklogItemsHandler(
  input: {
    status?: 'open' | 'in-progress' | 'done' | 'dismissed'
    priority?: 'P0' | 'P1' | 'P2' | 'P3'
    type?: 'feature' | 'bug' | 'research' | 'refactor' | 'chore'
    tag?: string
  },
  basePath: string,
  projectId: string,
): Promise<BacklogItem[]> {
  return createBacklogOps(basePath, projectId).getItems(input)
}

export async function getBacklogSummaryHandler(
  basePath: string,
  projectId: string,
): Promise<BacklogSummary> {
  return createBacklogOps(basePath, projectId).getSummary()
}

export async function moveBacklogItemHandler(
  input: {
    id: string
    priority?: 'P0' | 'P1' | 'P2' | 'P3'
    after?: string
    before?: string
  },
  basePath: string,
  projectId: string,
): Promise<BacklogItem> {
  const { id, ...target } = input
  return createBacklogOps(basePath, projectId).moveItem(id, target)
}

// --- Shared zod enums ---

const priorityEnum = z.enum(['P0', 'P1', 'P2', 'P3'])
const statusEnum = z.enum(['open', 'in-progress', 'done', 'dismissed'])
const typeEnum = z.enum(['feature', 'bug', 'research', 'refactor', 'chore'])

const referenceSchema = z.object({
  label: z.string().describe('Label for the reference'),
  path: z.string().describe('File path or URL'),
})

// --- MCP tool registration ---

export function registerBacklogTools(server: McpServer, config?: ToolsConfig): void {
  setToolsConfig(config)

  server.registerTool(
    'create_backlog_item',
    {
      description: 'Create a new backlog item',
      inputSchema: {
        title: z.string().describe('Title of the backlog item'),
        description: z.string().optional().describe('Detailed description'),
        priority: priorityEnum.optional().describe('Priority level (P0-P3)'),
        type: typeEnum.optional().describe('Item type'),
        tags: z.array(z.string()).optional().describe('Tags for categorization'),
        references: z.array(referenceSchema).optional().describe('File or URL references'),
        externalUrl: z.string().optional().describe('External URL (e.g., issue tracker link)'),
        scenarioIds: z.array(z.string()).optional().describe('Linked scenario IDs'),
      },
    },
    async (input) => {
      const result = await createBacklogItemHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'update_backlog_item',
    {
      description: 'Update an existing backlog item',
      inputSchema: {
        id: z.string().describe('The ID of the backlog item to update'),
        title: z.string().optional().describe('Updated title'),
        description: z.string().optional().describe('Updated description'),
        status: statusEnum.optional().describe('Updated status'),
        priority: priorityEnum.optional().describe('Updated priority level'),
        type: typeEnum.optional().describe('Updated item type'),
        tags: z.array(z.string()).optional().describe('Replace tags array'),
        references: z.array(referenceSchema).optional().describe('Replace references array'),
        externalUrl: z.string().optional().describe('Updated external URL'),
        scenarioIds: z.array(z.string()).optional().describe('Replace linked scenario IDs'),
      },
    },
    async (input) => {
      const result = await updateBacklogItemHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'delete_backlog_item',
    {
      description: 'Delete a backlog item',
      inputSchema: {
        id: z.string().describe('The ID of the backlog item to delete'),
      },
    },
    async (input) => {
      await deleteBacklogItemHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted: input.id }) }] }
    },
  )

  server.registerTool(
    'get_backlog_items',
    {
      description: 'List backlog items with optional filters',
      inputSchema: {
        status: statusEnum.optional().describe('Filter by status'),
        priority: priorityEnum.optional().describe('Filter by priority'),
        type: typeEnum.optional().describe('Filter by item type'),
        tag: z.string().optional().describe('Filter by tag'),
      },
    },
    async (input) => {
      const result = await getBacklogItemsHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'get_backlog_summary',
    {
      description: 'Get counts of backlog items by status and priority',
    },
    async () => {
      const result = await getBacklogSummaryHandler(resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'move_backlog_item',
    {
      description: 'Reorder or reprioritize a backlog item',
      inputSchema: {
        id: z.string().describe('The ID of the backlog item to move'),
        priority: priorityEnum.optional().describe('New priority level'),
        after: z.string().optional().describe('Place after this item ID'),
        before: z.string().optional().describe('Place before this item ID'),
      },
    },
    async (input) => {
      const result = await moveBacklogItemHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )
}
