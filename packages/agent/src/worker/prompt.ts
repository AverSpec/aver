import type { WorkerInput, ArtifactContent } from '../types.js'
import type { Scenario } from '@aver/workspace'

interface PromptParts {
  system: string
  user: string
}

const SKILL_INSTRUCTIONS: Record<string, string> = {
  investigation: `## Skill: Investigation

Your job is to explore the codebase and report what you find. Do NOT modify any files.

1. Use Read, Glob, and Grep to understand the codebase structure
2. Identify seams — points where new behavior can be inserted
3. Document what you find in your response

Focus on: file structure, key abstractions, data flow, existing tests.`,

  'tdd-loop': `## Skill: TDD Loop

Your job is to make the failing aver acceptance test pass through small, incremental changes.

1. Run the aver test to see the current failure
2. Read the error message and trace
3. Identify the smallest change to make progress
4. If the failure is in app code:
   a. Write a unit test for just that behavior
   b. Make the unit test pass with the smallest change
   c. Run the aver test again
5. If the failure is in the adapter: fix the adapter binding, run again
6. If GREEN: you're done
7. If still RED with the SAME error after 3 attempts: report status as "stuck"
8. If RED with a DIFFERENT error: that's progress, go to step 2

Run tests with: \`pnpm exec vitest run\` or the aver MCP tools.`,

  characterization: `## Skill: Characterization

Your job is to lock in existing behavior by writing tests that capture what the system currently does.

1. Explore the existing behavior (run the app, read the code)
2. Write domain vocabulary that describes CURRENT behavior (not desired)
3. Write an adapter that binds to the real system
4. Write aver acceptance tests using the vocabulary
5. Tests should pass immediately (GREEN) — if they don't, the adapter is wrong
6. Do NOT change app code — only write tests, domains, and adapters

The goal is a safety net before making changes.`,
}

export function buildWorkerPrompt(input: WorkerInput, skill: string, skillContent?: string): PromptParts {
  const system = buildSystemPrompt(skill, skillContent)
  const user = buildUserPrompt(input)
  return { system, user }
}

function buildSystemPrompt(skill: string, skillContent?: string): string {
  const parts: string[] = []

  parts.push(`You are a worker agent for Aver, a domain-driven development platform.

You have been dispatched to complete a specific goal. Use the tools available to you (Read, Edit, Write, Bash, Glob, Grep, and Aver MCP tools) to accomplish the goal.

## Output Format

When you are done, your final message MUST include a JSON block with your results:

\`\`\`json
{
  "summary": "What you did and what you learned",
  "artifacts": [
    {
      "type": "investigation | seam-analysis | test-snapshot | decision-log",
      "name": "artifact-name",
      "summary": "One-line summary",
      "content": "Full content of the artifact"
    }
  ],
  "scenarioUpdates": [
    { "scenarioId": "sc-1", "stage": "characterized", "rationale": "reason" }
  ],
  "suggestedNext": "What should happen next",
  "filesChanged": ["path/to/file.ts"],
  "status": "complete | stuck"
}
\`\`\``)

  const instructions = skillContent ?? SKILL_INSTRUCTIONS[skill]
  if (instructions) {
    parts.push(instructions)
  }

  return parts.join('\n\n')
}

function buildUserPrompt(input: WorkerInput): string {
  const sections: string[] = []

  sections.push(`## Goal\n\n${input.goal}`)

  if (input.scenarioDetail) {
    sections.push(`## Scenario\n\n${formatScenario(input.scenarioDetail)}`)
  }

  if (input.domainVocabulary) {
    sections.push(`## Domain Vocabulary\n\n${input.domainVocabulary}`)
  }

  if (input.artifacts.length) {
    sections.push(`## Context Artifacts\n\n${input.artifacts.map(formatArtifact).join('\n\n---\n\n')}`)
  }

  return sections.join('\n\n')
}

function formatScenario(scenario: Scenario): string {
  const parts = [
    `**Behavior:** ${scenario.behavior}`,
    `**Stage:** ${scenario.stage}`,
    `**ID:** ${scenario.id}`,
  ]
  if (scenario.context) parts.push(`**Context:** ${scenario.context}`)
  if (scenario.story) parts.push(`**Story:** ${scenario.story}`)
  if (scenario.rules.length) parts.push(`**Rules:**\n${scenario.rules.map((r) => `- ${r}`).join('\n')}`)
  if (scenario.seams.length) parts.push(`**Seams:**\n${scenario.seams.map((s) => `- ${s}`).join('\n')}`)
  if (scenario.constraints.length) parts.push(`**Constraints:**\n${scenario.constraints.map((c) => `- ${c}`).join('\n')}`)
  return parts.join('\n')
}

function formatArtifact(artifact: ArtifactContent): string {
  return `### ${artifact.name} (${artifact.type})\n\n${artifact.content}`
}
