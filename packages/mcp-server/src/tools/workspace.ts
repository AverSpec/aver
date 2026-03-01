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
  type BatchAdvanceResult,
  type BatchRevisitResult,
  type ScenarioSummary,
  type Question,
  type Phase,
} from '@aver/agent'
import type { ToolsConfig } from './types.js'
import { setToolsConfig, resolveBasePath, resolveProjectId, getCachedStore } from './workspace-helpers.js'

export { clearWorkspaceCache } from './workspace-helpers.js'

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
  input: { stage?: Stage; story?: string; keyword?: string; mode?: 'observed' | 'intended'; hasConfirmation?: boolean; domainOperation?: string; hasOpenQuestions?: boolean; createdAfter?: string; createdBefore?: string; fields?: string[] },
  basePath: string,
  projectId: string,
): Promise<Scenario[] | Partial<Scenario>[]> {
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

export async function confirmScenarioHandler(
  input: { id: string; confirmer: string },
  basePath: string,
  projectId: string,
): Promise<void> {
  await createOps(basePath, projectId).confirmScenario(input.id, input.confirmer)
}

export async function updateScenarioHandler(
  input: { id: string; behavior?: string; context?: string; story?: string; rules?: string[]; examples?: Array<{ description: string; expectedOutcome: string; given?: string }>; constraints?: string[]; seams?: Array<{ type: string; location: string; description: string }> },
  basePath: string,
  projectId: string,
): Promise<Scenario> {
  const { id, ...updates } = input
  return createOps(basePath, projectId).updateScenario(id, updates)
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

export async function batchAdvanceScenariosHandler(
  input: { ids: string[]; rationale: string; promotedBy: string },
  basePath: string,
  projectId: string,
): Promise<BatchAdvanceResult> {
  return createOps(basePath, projectId).batchAdvance(input)
}

export async function batchRevisitScenariosHandler(
  input: { ids: string[]; targetStage: Stage; rationale: string },
  basePath: string,
  projectId: string,
): Promise<BatchRevisitResult> {
  return createOps(basePath, projectId).batchRevisit(input)
}

// --- MCP tool registration ---

const stageEnum = z.enum(['captured', 'characterized', 'mapped', 'specified', 'implemented'])

export function registerWorkspaceTools(server: McpServer, config?: ToolsConfig): void {
  setToolsConfig(config)
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
      description: 'Get scenarios with optional filters by stage, story, keyword, mode, confirmation status, domain operation, open questions, date range, and field projection',
      inputSchema: {
        stage: stageEnum.optional().describe('Filter by maturity stage'),
        story: z.string().optional().describe('Filter by story name'),
        keyword: z.string().optional().describe('Filter by keyword in behavior or context'),
        mode: z.enum(['observed', 'intended']).optional().describe('Filter by mode'),
        hasConfirmation: z.boolean().optional().describe('Filter by whether confirmedBy is set'),
        domainOperation: z.string().optional().describe('Filter by domain operation (substring match)'),
        hasOpenQuestions: z.boolean().optional().describe('Filter by whether scenario has unresolved questions'),
        createdAfter: z.string().optional().describe('Filter scenarios created after this ISO date'),
        createdBefore: z.string().optional().describe('Filter scenarios created before this ISO date'),
        fields: z.array(z.string()).optional().describe('Project only these fields (e.g. ["id", "stage", "behavior"])'),
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
    'confirm_scenario',
    {
      description: 'Confirm a scenario as validated by a human. This is a human-only gate — it sets confirmedBy which is required before advancing from characterized to mapped.',
      inputSchema: {
        id: z.string().describe('The ID of the scenario to confirm'),
        confirmer: z.string().describe('Who is confirming (e.g., "product-owner", "business-analyst")'),
      },
    },
    async (input) => {
      await confirmScenarioHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify({ confirmed: input.id, by: input.confirmer }) }] }
    },
  )

  server.registerTool(
    'update_scenario',
    {
      description: 'Update scenario fields (behavior, context, story, rules, examples, constraints, seams). Does not change stage — use advance_scenario or revisit_scenario for that.',
      inputSchema: {
        id: z.string().describe('The ID of the scenario to update'),
        behavior: z.string().optional().describe('Updated behavior description'),
        context: z.string().optional().describe('Updated context'),
        story: z.string().optional().describe('Updated story name'),
        rules: z.array(z.string()).optional().describe('Replace rules array'),
        examples: z.array(z.object({
          description: z.string(),
          expectedOutcome: z.string(),
          given: z.string().optional(),
        })).optional().describe('Replace examples array'),
        constraints: z.array(z.string()).optional().describe('Replace constraints array'),
        seams: z.array(z.object({
          type: z.string(),
          location: z.string(),
          description: z.string(),
        })).optional().describe('Replace seams array'),
      },
    },
    async (input) => {
      const result = await updateScenarioHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
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

  server.registerTool(
    'batch_advance_scenarios',
    {
      description: 'Advance multiple scenarios to the next maturity stage. Partial success — blocked/errored items are skipped, others succeed. Returns per-item results and summary counts.',
      inputSchema: {
        ids: z.array(z.string()).describe('IDs of scenarios to advance'),
        rationale: z.string().describe('Reason for advancement'),
        promotedBy: z.string().describe('Who is advancing the scenarios'),
      },
    },
    async (input) => {
      const result = await batchAdvanceScenariosHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'batch_revisit_scenarios',
    {
      description: 'Revisit multiple scenarios by moving them back to an earlier maturity stage. Partial success — errored items are skipped, others succeed. Returns per-item results and summary counts.',
      inputSchema: {
        ids: z.array(z.string()).describe('IDs of scenarios to revisit'),
        targetStage: stageEnum.describe('The stage to revisit to'),
        rationale: z.string().describe('Reason for revisiting'),
      },
    },
    async (input) => {
      const result = await batchRevisitScenariosHandler(input, resolveBasePath(), resolveProjectId())
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )
}
