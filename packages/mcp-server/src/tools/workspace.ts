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
  type ScenarioSummary,
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

export function captureScenarioHandler(
  input: { behavior: string; context?: string; story?: string; mode?: 'observed' | 'intended' },
  basePath: string,
  projectId: string,
): Scenario {
  return createOps(basePath, projectId).captureScenario(input)
}

export function getScenarioSummaryHandler(
  basePath: string,
  projectId: string,
): ScenarioSummary {
  return createOps(basePath, projectId).getScenarioSummary()
}

export function getScenariosHandler(
  input: { stage?: Stage; story?: string; keyword?: string },
  basePath: string,
  projectId: string,
): Scenario[] {
  return createOps(basePath, projectId).getScenarios(input)
}

export function advanceScenarioHandler(
  input: { id: string; rationale: string; promotedBy: string },
  basePath: string,
  projectId: string,
): Scenario {
  return createOps(basePath, projectId).advanceScenario(input.id, {
    rationale: input.rationale,
    promotedBy: input.promotedBy,
  })
}

export function regressScenarioHandler(
  input: { id: string; targetStage: Stage; rationale: string },
  basePath: string,
  projectId: string,
): Scenario {
  return createOps(basePath, projectId).regressScenario(input.id, {
    targetStage: input.targetStage,
    rationale: input.rationale,
  })
}

export function deleteScenarioHandler(
  input: { id: string },
  basePath: string,
  projectId: string,
): void {
  createOps(basePath, projectId).deleteScenario(input.id)
}

export function addQuestionHandler(
  input: { scenarioId: string; text: string },
  basePath: string,
  projectId: string,
): Question {
  return createOps(basePath, projectId).addQuestion(input.scenarioId, input.text)
}

export function resolveQuestionHandler(
  input: { scenarioId: string; questionId: string; answer: string },
  basePath: string,
  projectId: string,
): void {
  createOps(basePath, projectId).resolveQuestion(input.scenarioId, input.questionId, input.answer)
}

export function linkToDomainHandler(
  input: { scenarioId: string; domainOperation?: string; testNames?: string[]; approvalBaseline?: string },
  basePath: string,
  projectId: string,
): void {
  const { scenarioId, ...links } = input
  createOps(basePath, projectId).linkToDomain(scenarioId, links)
}

export function getWorkflowPhaseHandler(
  basePath: string,
  projectId: string,
): Phase {
  const store = createStore(basePath, projectId)
  const workspace = store.load()
  return detectPhase(workspace)
}

export function getAdvanceCandidatesHandler(
  basePath: string,
  projectId: string,
): Scenario[] {
  return createOps(basePath, projectId).getAdvanceCandidates()
}

export function exportScenariosHandler(
  input: { format: 'markdown' | 'json' },
  basePath: string,
  projectId: string,
): string {
  const store = createStore(basePath, projectId)
  const workspace = store.load()
  return input.format === 'markdown' ? exportMarkdown(workspace) : exportJson(workspace)
}

export function importScenariosHandler(
  input: { json: string },
  basePath: string,
  projectId: string,
): { added: number; skipped: number } {
  const store = createStore(basePath, projectId)
  return importJson(store, input.json)
}

// --- MCP tool registration ---

const stageEnum = z.enum(['captured', 'characterized', 'mapped', 'specified', 'implemented'])

export function registerWorkspaceTools(server: McpServer): void {
  server.registerTool(
    'get_scenario_summary',
    {
      description: 'Get a summary of the scenario workspace with counts per maturity stage and open questions',
    },
    async () => {
      const result = getScenarioSummaryHandler(resolveBasePath(), resolveProjectId())
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
      const result = getScenariosHandler(input, resolveBasePath(), resolveProjectId())
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
      const result = captureScenarioHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'advance_scenario',
    {
      description: 'Advance a scenario to the next maturity stage (captured -> characterized -> mapped -> specified -> implemented)',
      inputSchema: {
        id: z.string().describe('The ID of the scenario to advance'),
        rationale: z.string().describe('Reason for advancement'),
        promotedBy: z.string().describe('Who is advancing the scenario'),
      },
    },
    async (input) => {
      const result = advanceScenarioHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'regress_scenario',
    {
      description: 'Regress a scenario to an earlier maturity stage',
      inputSchema: {
        id: z.string().describe('The ID of the scenario to regress'),
        targetStage: stageEnum.describe('The stage to regress to'),
        rationale: z.string().describe('Reason for regression'),
      },
    },
    async (input) => {
      const result = regressScenarioHandler(input, resolveBasePath(), resolveProjectId())
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
      deleteScenarioHandler(input, resolveBasePath(), resolveProjectId())
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
      const result = addQuestionHandler(input, resolveBasePath(), resolveProjectId())
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
      resolveQuestionHandler(input, resolveBasePath(), resolveProjectId())
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
      linkToDomainHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true }, null, 2) }] }
    },
  )

  server.registerTool(
    'get_workflow_phase',
    {
      description: 'Detect the current workflow phase based on workspace state (kickoff, investigation, mapping, specification, implementation, verification)',
    },
    async () => {
      const result = getWorkflowPhaseHandler(resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'get_advance_candidates',
    {
      description: 'Get scenarios that are eligible for advancement (no open questions, not yet implemented)',
    },
    async () => {
      const result = getAdvanceCandidatesHandler(resolveBasePath(), resolveProjectId())
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
      const result = exportScenariosHandler(input, resolveBasePath(), resolveProjectId())
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
      const result = importScenariosHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )
}
