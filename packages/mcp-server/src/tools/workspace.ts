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
  type Scenario,
  type AdvanceResult,
  type ScenarioSummary,
  type Question,
  type Phase,
} from '@aver/workspace'
import type { ToolsConfig } from './types.js'

// --- Path resolution ---

let _config: ToolsConfig | undefined

function resolveBasePath(): string {
  return _config?.workspaceBasePath ?? process.env.AVER_WORKSPACE_PATH ?? join(homedir(), '.aver', 'workspaces')
}

function resolveProjectId(): string {
  return _config?.workspaceProjectId ?? process.env.AVER_PROJECT_ID ?? basename(process.cwd())
}

// --- Store cache ---

let cachedStore: WorkspaceStore | undefined
let cachedStoreKey: string | undefined

function getCachedStore(basePath: string, projectId: string): WorkspaceStore {
  const key = `${basePath}\0${projectId}`
  if (cachedStore && cachedStoreKey === key) return cachedStore
  cachedStore = new WorkspaceStore(basePath, projectId)
  cachedStoreKey = key
  return cachedStore
}

/**
 * Clear the cached WorkspaceStore/WorkspaceOps instance.
 * Called when config is reloaded so stale state is not retained.
 */
export function clearWorkspaceCache(): void {
  cachedStore = undefined
  cachedStoreKey = undefined
}

// --- Helpers ---

function createOps(basePath: string, projectId: string): WorkspaceOps {
  return new WorkspaceOps(getCachedStore(basePath, projectId))
}

function createStore(basePath: string, projectId: string): WorkspaceStore {
  return getCachedStore(basePath, projectId)
}

// --- Handler functions (async, no MCP dependency) ---

export async function captureScenarioHandler(
  input: { behavior: string; context?: string; story?: string; mode?: 'observed' | 'intended' },
  basePath: string,
  projectId: string,
): Promise<Scenario> {
  return createOps(basePath, projectId).captureScenario(input)
}

export async function getScenarioSummaryHandler(
  basePath: string,
  projectId: string,
): Promise<ScenarioSummary> {
  return createOps(basePath, projectId).getScenarioSummary()
}

export async function getScenariosHandler(
  input: { stage?: Stage; story?: string; keyword?: string },
  basePath: string,
  projectId: string,
): Promise<Scenario[]> {
  return createOps(basePath, projectId).getScenarios(input)
}

export async function advanceScenarioHandler(
  input: { id: string; rationale: string; promotedBy: string },
  basePath: string,
  projectId: string,
): Promise<AdvanceResult> {
  return createOps(basePath, projectId).advanceScenario(input.id, {
    rationale: input.rationale,
    promotedBy: input.promotedBy,
  })
}

export async function revisitScenarioHandler(
  input: { id: string; targetStage: Stage; rationale: string },
  basePath: string,
  projectId: string,
): Promise<Scenario> {
  return createOps(basePath, projectId).revisitScenario(input.id, {
    targetStage: input.targetStage,
    rationale: input.rationale,
  })
}

export async function deleteScenarioHandler(
  input: { id: string },
  basePath: string,
  projectId: string,
): Promise<void> {
  await createOps(basePath, projectId).deleteScenario(input.id)
}

export async function addQuestionHandler(
  input: { scenarioId: string; text: string },
  basePath: string,
  projectId: string,
): Promise<Question> {
  return createOps(basePath, projectId).addQuestion(input.scenarioId, input.text)
}

export async function resolveQuestionHandler(
  input: { scenarioId: string; questionId: string; answer: string },
  basePath: string,
  projectId: string,
): Promise<void> {
  await createOps(basePath, projectId).resolveQuestion(input.scenarioId, input.questionId, input.answer)
}

export async function linkToDomainHandler(
  input: { scenarioId: string; domainOperation?: string; testNames?: string[]; approvalBaseline?: string },
  basePath: string,
  projectId: string,
): Promise<void> {
  const { scenarioId, ...links } = input
  await createOps(basePath, projectId).linkToDomain(scenarioId, links)
}

export async function getWorkflowPhaseHandler(
  basePath: string,
  projectId: string,
): Promise<Phase> {
  const store = createStore(basePath, projectId)
  const workspace = await store.load()
  return detectPhase(workspace)
}

export async function getAdvanceCandidatesHandler(
  basePath: string,
  projectId: string,
): Promise<Scenario[]> {
  return createOps(basePath, projectId).getAdvanceCandidates()
}

export async function exportScenariosHandler(
  input: { format: 'markdown' | 'json' },
  basePath: string,
  projectId: string,
): Promise<string> {
  const store = createStore(basePath, projectId)
  const workspace = await store.load()
  return input.format === 'markdown' ? exportMarkdown(workspace) : exportJson(workspace)
}

export async function importScenariosHandler(
  input: { json: string },
  basePath: string,
  projectId: string,
): Promise<{ added: number; skipped: number }> {
  const store = createStore(basePath, projectId)
  return importJson(store, input.json)
}

// --- MCP tool registration ---

const stageEnum = z.enum(['captured', 'characterized', 'mapped', 'specified', 'implemented'])

export function registerWorkspaceTools(server: McpServer, config?: ToolsConfig): void {
  _config = config
  server.registerTool(
    'get_scenario_summary',
    {
      description: 'Get a summary of the scenario workspace with counts per maturity stage and open questions',
    },
    async () => {
      const result = await getScenarioSummaryHandler(resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'get_scenarios',
    {
      description: 'Get scenarios with optional filters by stage, story, or keyword',
      inputSchema: {
        stage: stageEnum.optional().describe('Filter by maturity stage'),
        story: z.string().optional().describe('Filter by story name'),
        keyword: z.string().optional().describe('Filter by keyword in behavior or context'),
      },
    },
    async (input) => {
      const result = await getScenariosHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'capture_scenario',
    {
      description: 'Capture a scenario in the workspace. Creates a scenario at the "captured" stage.',
      inputSchema: {
        behavior: z.string().describe('The observed or intended behavior'),
        context: z.string().optional().describe('Context where the behavior was observed or is intended'),
        story: z.string().optional().describe('Story or feature this behavior belongs to'),
        mode: z.enum(['observed', 'intended']).optional().describe('Whether this is an observed behavior or stated intent'),
      },
    },
    async (input) => {
      const result = await captureScenarioHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'advance_scenario',
    {
      description: 'Advance a scenario to the next maturity stage (captured -> characterized -> mapped -> specified -> implemented). Returns { scenario, warnings } where warnings contains advisory messages. Hard blocks (e.g., open questions, missing domain links, missing confirmedBy) will throw an error.',
      inputSchema: {
        id: z.string().describe('The ID of the scenario to advance'),
        rationale: z.string().describe('Reason for advancement'),
        promotedBy: z.string().describe('Who is advancing the scenario'),
      },
    },
    async (input) => {
      const result = await advanceScenarioHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'revisit_scenario',
    {
      description: 'Revisit a scenario by moving it back to an earlier maturity stage',
      inputSchema: {
        id: z.string().describe('The ID of the scenario to revisit'),
        targetStage: stageEnum.describe('The stage to revisit to'),
        rationale: z.string().describe('Reason for revisiting'),
      },
    },
    async (input) => {
      const result = await revisitScenarioHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'delete_scenario',
    {
      description: 'Delete a scenario from the workspace by ID',
      inputSchema: {
        id: z.string().describe('The ID of the scenario to delete'),
      },
    },
    async (input) => {
      await deleteScenarioHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted: input.id }) }] }
    },
  )

  server.registerTool(
    'add_question',
    {
      description: 'Add an open question to a scenario',
      inputSchema: {
        scenarioId: z.string().describe('The ID of the scenario to add a question to'),
        text: z.string().describe('The question text'),
      },
    },
    async (input) => {
      const result = await addQuestionHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'resolve_question',
    {
      description: 'Resolve an open question on a scenario with an answer',
      inputSchema: {
        scenarioId: z.string().describe('The ID of the scenario'),
        questionId: z.string().describe('The ID of the question to resolve'),
        answer: z.string().describe('The answer to the question'),
      },
    },
    async (input) => {
      await resolveQuestionHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true }, null, 2) }] }
    },
  )

  server.registerTool(
    'link_to_domain',
    {
      description: 'Link a scenario to domain artifacts (domain operation, test names, approval baseline)',
      inputSchema: {
        scenarioId: z.string().describe('The ID of the scenario to link'),
        domainOperation: z.string().optional().describe('Domain operation name (e.g., "Cart.addItem")'),
        testNames: z.array(z.string()).optional().describe('Associated test names'),
        approvalBaseline: z.string().optional().describe('Approval baseline path'),
      },
    },
    async (input) => {
      await linkToDomainHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true }, null, 2) }] }
    },
  )

  server.registerTool(
    'get_workflow_phase',
    {
      description: 'Detect the current workflow phase based on workspace state (kickoff, investigation, mapping, specification, implementation, verification)',
    },
    async () => {
      const result = await getWorkflowPhaseHandler(resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'get_advance_candidates',
    {
      description: 'Get scenarios that are eligible for advancement (no open questions, not yet implemented)',
    },
    async () => {
      const result = await getAdvanceCandidatesHandler(resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'export_scenarios',
    {
      description: 'Export the scenario workspace as markdown or JSON',
      inputSchema: {
        format: z.enum(['markdown', 'json']).describe('Export format'),
      },
    },
    async (input) => {
      const result = await exportScenariosHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: result }] }
    },
  )

  server.registerTool(
    'import_scenarios',
    {
      description: 'Import scenarios from JSON. Skips scenarios with duplicate IDs.',
      inputSchema: {
        json: z.string().describe('JSON string of workspace data to import'),
      },
    },
    async (input) => {
      const result = await importScenariosHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )
}
