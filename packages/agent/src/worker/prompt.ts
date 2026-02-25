import type { WorkerInput, ArtifactContent } from '../types.js'
import type { Scenario } from '@aver/workspace'

interface PromptParts {
  system: string
  user: string
}

export function buildWorkerPrompt(input: WorkerInput, skill: string, skillContent?: string): PromptParts {
  const system = buildSystemPrompt(skill, skillContent)
  const user = buildUserPrompt(input)
  return { system, user }
}

function buildSystemPrompt(skill: string, skillContent?: string): string {
  const parts: string[] = []

  parts.push(`You are a worker agent for Aver, a domain-driven development platform.

You have been dispatched to complete a specific goal. Use the tools available to you (Read, Edit, Write, Bash, Glob, Grep) to accomplish the goal.

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

  if (skillContent) {
    parts.push(skillContent)
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
