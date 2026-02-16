import { basename } from 'node:path'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  WorkspaceStore,
  WorkspaceOps,
  detectPhase,
  exportMarkdown,
  exportJson,
  importJson,
  type Stage,
  type WorkspaceItem,
  type WorkspaceSummary,
  type Question,
  type Phase,
} from '@aver/workspace'

// --- Path resolution ---

function resolveBasePath(): string {
  return process.env.AVER_WORKSPACE_PATH ?? join(homedir(), '.aver', 'workspaces')
}

function resolveProjectId(): string {
  return process.env.AVER_PROJECT_ID ?? basename(process.cwd())
}

// --- Helpers ---

function createOps(basePath: string, projectId: string): WorkspaceOps {
  return new WorkspaceOps(new WorkspaceStore(basePath, projectId))
}

function createStore(basePath: string, projectId: string): WorkspaceStore {
  return new WorkspaceStore(basePath, projectId)
}

// --- Handler functions (pure, no MCP dependency) ---

export function recordObservationHandler(
  input: { behavior: string; context?: string },
  basePath: string,
  projectId: string,
): WorkspaceItem {
  return createOps(basePath, projectId).recordObservation(input)
}

export function recordIntentHandler(
  input: { behavior: string; story?: string; context?: string },
  basePath: string,
  projectId: string,
): WorkspaceItem {
  return createOps(basePath, projectId).recordIntent(input)
}

export function getWorkspaceSummaryHandler(
  basePath: string,
  projectId: string,
): WorkspaceSummary {
  return createOps(basePath, projectId).getSummary()
}

export function getWorkspaceItemsHandler(
  input: { stage?: Stage; story?: string; keyword?: string },
  basePath: string,
  projectId: string,
): WorkspaceItem[] {
  return createOps(basePath, projectId).getItems(input)
}

export function promoteItemHandler(
  input: { id: string; rationale: string; promotedBy: string },
  basePath: string,
  projectId: string,
): WorkspaceItem {
  return createOps(basePath, projectId).promoteItem(input.id, {
    rationale: input.rationale,
    promotedBy: input.promotedBy,
  })
}

export function demoteItemHandler(
  input: { id: string; targetStage: Stage; rationale: string },
  basePath: string,
  projectId: string,
): WorkspaceItem {
  return createOps(basePath, projectId).demoteItem(input.id, {
    targetStage: input.targetStage,
    rationale: input.rationale,
  })
}

export function addQuestionHandler(
  input: { itemId: string; text: string },
  basePath: string,
  projectId: string,
): Question {
  return createOps(basePath, projectId).addQuestion(input.itemId, input.text)
}

export function resolveQuestionHandler(
  input: { itemId: string; questionId: string; answer: string },
  basePath: string,
  projectId: string,
): void {
  createOps(basePath, projectId).resolveQuestion(input.itemId, input.questionId, input.answer)
}

export function linkToDomainHandler(
  input: { itemId: string; domainOperation?: string; testNames?: string[]; approvalBaseline?: string },
  basePath: string,
  projectId: string,
): void {
  const { itemId, ...links } = input
  createOps(basePath, projectId).linkToDomain(itemId, links)
}

export function getWorkflowPhaseHandler(
  basePath: string,
  projectId: string,
): Phase {
  const store = createStore(basePath, projectId)
  const workspace = store.load()
  return detectPhase(workspace)
}

export function getPromotionCandidatesHandler(
  basePath: string,
  projectId: string,
): WorkspaceItem[] {
  return createOps(basePath, projectId).getPromotionCandidates()
}

export function exportWorkspaceHandler(
  input: { format: 'markdown' | 'json' },
  basePath: string,
  projectId: string,
): string {
  const store = createStore(basePath, projectId)
  const workspace = store.load()
  return input.format === 'markdown' ? exportMarkdown(workspace) : exportJson(workspace)
}

export function importWorkspaceHandler(
  input: { json: string },
  basePath: string,
  projectId: string,
): { added: number; skipped: number } {
  const store = createStore(basePath, projectId)
  return importJson(store, input.json)
}

// --- MCP tool registration ---

const stageEnum = z.enum(['observed', 'explored', 'intended', 'formalized'])

export function registerWorkspaceTools(server: McpServer): void {
  server.registerTool(
    'get_workspace_summary',
    {
      description: 'Get a summary of the scenario workspace with counts per maturity stage and open questions',
    },
    async () => {
      const result = getWorkspaceSummaryHandler(resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'get_workspace_items',
    {
      description: 'Get workspace items with optional filters by stage, story, or keyword',
      inputSchema: {
        stage: stageEnum.optional().describe('Filter by maturity stage'),
        story: z.string().optional().describe('Filter by story name'),
        keyword: z.string().optional().describe('Filter by keyword in behavior or context'),
      },
    },
    async (input) => {
      const result = getWorkspaceItemsHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'record_observation',
    {
      description: 'Record an observed behavior in the workspace. Creates an item at the "observed" stage.',
      inputSchema: {
        behavior: z.string().describe('The observed behavior'),
        context: z.string().optional().describe('Context where the behavior was observed'),
      },
    },
    async (input) => {
      const result = recordObservationHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'record_intent',
    {
      description: 'Record an intended behavior in the workspace. Creates an item at the "intended" stage.',
      inputSchema: {
        behavior: z.string().describe('The intended behavior'),
        story: z.string().optional().describe('Story or feature this behavior belongs to'),
        context: z.string().optional().describe('Context for the intended behavior'),
      },
    },
    async (input) => {
      const result = recordIntentHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'promote_item',
    {
      description: 'Promote a workspace item to the next maturity stage (observed -> explored -> intended -> formalized)',
      inputSchema: {
        id: z.string().describe('The ID of the item to promote'),
        rationale: z.string().describe('Reason for promotion'),
        promotedBy: z.string().describe('Who is promoting the item'),
      },
    },
    async (input) => {
      const result = promoteItemHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'demote_item',
    {
      description: 'Demote a workspace item to an earlier maturity stage',
      inputSchema: {
        id: z.string().describe('The ID of the item to demote'),
        targetStage: stageEnum.describe('The stage to demote to'),
        rationale: z.string().describe('Reason for demotion'),
      },
    },
    async (input) => {
      const result = demoteItemHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'add_question',
    {
      description: 'Add an open question to a workspace item',
      inputSchema: {
        itemId: z.string().describe('The ID of the item to add a question to'),
        text: z.string().describe('The question text'),
      },
    },
    async (input) => {
      const result = addQuestionHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'resolve_question',
    {
      description: 'Resolve an open question on a workspace item with an answer',
      inputSchema: {
        itemId: z.string().describe('The ID of the item'),
        questionId: z.string().describe('The ID of the question to resolve'),
        answer: z.string().describe('The answer to the question'),
      },
    },
    async (input) => {
      resolveQuestionHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true }, null, 2) }] }
    },
  )

  server.registerTool(
    'link_to_domain',
    {
      description: 'Link a workspace item to domain artifacts (domain operation, test names, approval baseline)',
      inputSchema: {
        itemId: z.string().describe('The ID of the item to link'),
        domainOperation: z.string().optional().describe('Domain operation name (e.g., "Cart.addItem")'),
        testNames: z.array(z.string()).optional().describe('Associated test names'),
        approvalBaseline: z.string().optional().describe('Approval baseline path'),
      },
    },
    async (input) => {
      linkToDomainHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true }, null, 2) }] }
    },
  )

  server.registerTool(
    'get_workflow_phase',
    {
      description: 'Detect the current workflow phase based on workspace state (kickoff, discovery, mapping, formalization, implementation, verification)',
    },
    async () => {
      const result = getWorkflowPhaseHandler(resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'get_promotion_candidates',
    {
      description: 'Get workspace items that are eligible for promotion (no open questions, not yet formalized)',
    },
    async () => {
      const result = getPromotionCandidatesHandler(resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'export_workspace',
    {
      description: 'Export the workspace as markdown or JSON',
      inputSchema: {
        format: z.enum(['markdown', 'json']).describe('Export format'),
      },
    },
    async (input) => {
      const result = exportWorkspaceHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: result }] }
    },
  )

  server.registerTool(
    'import_workspace',
    {
      description: 'Import workspace items from JSON. Skips items with duplicate IDs.',
      inputSchema: {
        json: z.string().describe('JSON string of workspace data to import'),
      },
    },
    async (input) => {
      const result = importWorkspaceHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )
}
