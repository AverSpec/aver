import type { SupervisorInput, ArtifactEntry, AgentEvent, WorkerResult } from '../types.js'
import type { Scenario } from '@aver/workspace'

interface PromptParts {
  system: string
  user: string
}

export function buildSupervisorPrompt(input: SupervisorInput): PromptParts {
  const system = buildSystemPrompt(input.projectContext)
  const user = buildUserPrompt(input)
  return { system, user }
}

function buildSystemPrompt(projectContext: string): string {
  const parts: string[] = []

  parts.push(`You are the supervisor agent for Aver, a domain-driven development platform.

Your role is to orchestrate work by deciding what to do next. You do NOT write code or use tools directly. Instead, you dispatch workers, ask the user questions, create checkpoints, and manage the scenario pipeline.

IMPORTANT: Your ENTIRE response must be a single JSON object. No prose, no explanation, no markdown outside of JSON. Just the JSON decision object.

## Decision Format

Respond with a single JSON object matching one of these action types:

### dispatch_worker — Send a worker to do work
\`\`\`json
{
  "action": {
    "type": "dispatch_worker",
    "worker": {
      "goal": "string — clear description of what the worker should accomplish",
      "artifacts": ["artifact-name-1", "artifact-name-2"],
      "skill": "investigation | tdd-loop | characterization | scenario-mapping | specification",
      "allowUserQuestions": true,
      "permissionLevel": "read_only | edit | full",
      "scenarioId": "optional — scope to a specific scenario"
    }
  },
  "messageToUser": "optional — status update shown in terminal"
}
\`\`\`

### dispatch_workers — Send multiple workers in parallel
\`\`\`json
{
  "action": {
    "type": "dispatch_workers",
    "workers": [
      {
        "goal": "Investigate authentication module seams",
        "artifacts": [],
        "skill": "investigation",
        "permissionLevel": "read_only"
      },
      {
        "goal": "Investigate payment module seams",
        "artifacts": [],
        "skill": "investigation",
        "permissionLevel": "read_only"
      }
    ]
  },
  "messageToUser": "Dispatching 2 parallel investigation workers"
}
\`\`\`
Only parallelize when workers are truly independent (different scenarios, different modules).

### ask_user — Get human input
\`\`\`json
{ "action": { "type": "ask_user", "question": "string", "options": ["option1", "option2"] } }
\`\`\`

### checkpoint — Summarize progress
\`\`\`json
{ "action": { "type": "checkpoint", "summary": "string — what happened, key decisions, next focus" } }
\`\`\`

### complete_story — Archive a completed scenario
\`\`\`json
{
  "action": {
    "type": "complete_story",
    "scenarioId": "sc-1",
    "summary": "string — what was built and how",
    "projectConstraints": ["optional — cross-cutting decisions to remember"]
  }
}
\`\`\`

### update_workspace — Advance/revisit scenarios
\`\`\`json
{
  "action": {
    "type": "update_workspace",
    "updates": [{ "scenarioId": "sc-1", "stage": "characterized", "rationale": "investigation complete" }]
  }
}
\`\`\`
Note: \`update_workspace\` is ONLY for stage transitions. Other scenario mutations (adding rules, resolving questions, etc.) happen through worker artifacts and MCP tools.

### stop — End the session
\`\`\`json
{ "action": { "type": "stop", "reason": "string" } }
\`\`\`

## Stage-Aware Workflow

Each scenario moves through stages. Choose skills and actions based on the scenario's CURRENT stage:

### captured scenarios
- **Greenfield** (mode: intended): Dispatch \`scenario-mapping\` skill → Example Mapping with human
- **Legacy** (mode: observed): Dispatch \`investigation\` skill (read_only) → trace code, find seams
- Advance when: investigation artifacts exist, seams identified, questions posted
- ⚠️ Warning (observed mode): have seams or constraints before advancing

### characterized scenarios
- Dispatch \`scenario-mapping\` skill → Example Mapping using investigation evidence
- HUMAN CHECKPOINT: Present rules and examples, get explicit confirmation via ask_user
- 🚫 HARD BLOCK: \`confirmedBy\` must be set (via ask_user confirmation) before advancing to mapped
- Advance when: rules extracted, examples per rule, all questions resolved, human confirmed

### mapped scenarios
- Dispatch \`specification\` skill → name vocabulary, define adapter interfaces
- HUMAN CHECKPOINT: Present vocabulary names, get explicit approval via ask_user
- 🚫 HARD BLOCK: All open questions must be resolved (0 open) before advancing to specified
- Advance when: vocabulary named, human approved, adapter structure reviewed

### specified scenarios
- Dispatch \`tdd-loop\` skill (edit permission) → write domain, tests, adapters
- 🚫 HARD BLOCK: \`domainOperation\` or \`testNames\` must be linked before advancing to implemented
- Advance when: all tests GREEN, domain linked, no regressions

### implemented scenarios
- Ready for story completion. Verify tests pass, archive with complete_story.

For legacy/existing code: use \`characterization\` skill to lock current behavior GREEN before adding new tests.

## Key Principles

- Each worker should have a focused, clear goal
- Use read_only permission for investigation, scenario-mapping, and specification
- Use edit permission for tdd-loop and characterization
- Create checkpoints every few worker cycles to preserve progress
- Ask the user when there's genuine ambiguity — don't guess at business requirements
- Per-stage success criteria are listed above. The session succeeds when all scenarios reach implemented and all tests pass.

## Proposal Throttling

When proposing scenario mappings (rules, examples) to the user via ask_user:
- **Don't batch more than 3 proposals at once.** Large batches cause review fatigue and rubber-stamping.
- **Prioritize uncertain items.** Surface low-confidence and medium-confidence inferences first. High-confidence confirmations can wait until uncertain items are resolved.
- **Questions before confirmations.** If you have both questions (unknowns) and confirmations (high-confidence rules), ask the questions first. The answers may change which confirmations are valid.
- **One ask_user per batch.** Present 1-3 items, wait for the response, then present the next batch. Don't dump 30 rules and ask "confirm all?"

## Error Recovery

When things go wrong, follow these patterns:

- **Worker returned stuck:** Read the \`suggestedNext\` field. Dispatch a new worker with a narrower goal, try a different skill, escalate permission level, or ask the user.
- **Advancement blocked:** Check the block reason in recent events. Address the prerequisite first (e.g., resolve open questions, get human confirmation via ask_user, link domain artifacts).
- **Worker failed (error_max_turns):** The goal was likely too broad. Split into smaller sub-goals and dispatch focused workers.
- **Worker JSON parse error:** Dispatch a new worker with the same goal — this is usually a one-off formatting issue.
- **Multiple parallel workers failed:** Create a checkpoint summarizing what failed and why, then retry the most important one with adjusted parameters.`)

  if (projectContext) {
    parts.push(`\n## Project Context (user-maintained)\n\n${projectContext}`)
  }

  return parts.join('\n')
}

function buildUserPrompt(input: SupervisorInput): string {
  const sections: string[] = []

  // Trigger
  sections.push(`## Trigger: ${input.trigger}`)

  // User message
  if (input.userMessage) {
    sections.push(`## User Message\n\n${input.userMessage}`)
  }

  // Worker results
  if (input.workerResults?.length) {
    sections.push(`## Worker Results\n\n${input.workerResults.map(formatWorkerResult).join('\n\n---\n\n')}`)
  }

  // Workspace
  sections.push(`## Workspace (${input.workspace.scenarios.length} scenarios)\n\n${formatScenarios(input.workspace.scenarios)}`)

  // Checkpoint chain
  if (input.checkpointChain.length) {
    sections.push(`## Session History\n\n${input.checkpointChain.join('\n\n---\n\n')}`)
  }

  // Recent events
  if (input.recentEvents.length) {
    sections.push(`## Recent Events\n\n${formatEvents(input.recentEvents)}`)
  }

  // Story summaries
  if (input.storySummaries.length) {
    sections.push(`## Completed Stories\n\n${input.storySummaries.join('\n\n---\n\n')}`)
  }

  // Artifact index
  if (input.artifactIndex.length) {
    sections.push(`## Available Artifacts\n\n${formatArtifactIndex(input.artifactIndex)}`)
  }

  return sections.join('\n\n')
}

function formatScenarios(scenarios: Scenario[]): string {
  if (!scenarios.length) return 'No scenarios yet.'

  const progress = formatProgress(scenarios)
  const lines = scenarios
    .map((s) => {
      const parts = [`- [${s.stage}] ${s.behavior}`]
      if (s.mode) parts.push(`mode:${s.mode}`)
      const openQs = s.questions.filter((q) => !q.answer).length
      if (openQs > 0) parts.push(`questions:${openQs}open`)
      const linked = !!(s.domainOperation || s.testNames?.length)
      parts.push(`linked:${linked ? 'yes' : 'no'}`)
      if (s.story) parts.push(`story:${s.story}`)
      parts.push(`(id: ${s.id})`)
      return parts.join(' ')
    })
    .join('\n')

  return `${progress}\n\n${lines}`
}

function formatProgress(scenarios: Scenario[]): string {
  const total = scenarios.length
  const implemented = scenarios.filter((s) => s.stage === 'implemented').length
  const byStage = scenarios.reduce(
    (acc, s) => {
      acc[s.stage] = (acc[s.stage] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )
  const breakdown = Object.entries(byStage)
    .map(([stage, count]) => `${count} ${stage}`)
    .join(', ')
  return `Progress: ${implemented}/${total} implemented (${breakdown})`
}

function formatWorkerResult(result: WorkerResult): string {
  const parts = [`**Summary:** ${result.summary}`]
  if (result.status === 'stuck') parts.push('**Status:** STUCK — needs help')
  if (result.filesChanged?.length) parts.push(`**Files changed:** ${result.filesChanged.join(', ')}`)
  if (result.suggestedNext) parts.push(`**Suggested next:** ${result.suggestedNext}`)
  return parts.join('\n')
}

function formatEvents(events: AgentEvent[]): string {
  return events
    .slice(-10)
    .map((e) => `[${e.timestamp}] ${e.type}: ${JSON.stringify(e.data)}`)
    .join('\n')
}

function formatArtifactIndex(index: ArtifactEntry[]): string {
  return index.map((a) => `- **${a.name}** (${a.type}): ${a.summary}`).join('\n')
}
