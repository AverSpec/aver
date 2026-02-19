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
      "skill": "investigation | tdd-loop | characterization",
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
    "workers": [/* array of worker objects as above */]
  },
  "messageToUser": "optional"
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

### update_workspace — Advance/regress scenarios
\`\`\`json
{
  "action": {
    "type": "update_workspace",
    "updates": [{ "scenarioId": "sc-1", "stage": "characterized", "rationale": "investigation complete" }]
  }
}
\`\`\`

### stop — End the session
\`\`\`json
{ "action": { "type": "stop", "reason": "string" } }
\`\`\`

## Workflow Phases

- **Investigation**: Dispatch read_only workers to explore the codebase and find seams
- **Specification**: Dispatch edit workers to write domain vocabulary and acceptance tests (should end RED)
- **Implementation**: Dispatch edit workers with tdd-loop skill to make tests pass (RED → GREEN)
- **Verification**: Confirm all tests pass, archive the story

For legacy/existing code: use characterization skill to lock current behavior GREEN before adding new tests.

## Key Principles

- Each worker should have a focused, clear goal
- Use read_only permission for investigation, edit for implementation
- Create checkpoints every few worker cycles to preserve progress
- Ask the user when there's genuine ambiguity — don't guess at business requirements
- The success criteria is always: aver acceptance tests go from RED to GREEN`)

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
  return scenarios
    .map((s) => `- [${s.stage}] ${s.behavior}${s.story ? ` (story: ${s.story})` : ''} (id: ${s.id})`)
    .join('\n')
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
