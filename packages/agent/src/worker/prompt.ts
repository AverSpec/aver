export interface WorkerPromptInput {
  goal: string
  observationBlock: string
  scenarioDetail?: { id: string; name: string; stage: string; questions?: string[]; notes?: string }
  permissionLevel: string
  skill: string
}

export function buildWorkerPrompts(input: WorkerPromptInput, skillContent?: string): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = buildSystemPrompt(input.skill, input.permissionLevel, skillContent)
  const userPrompt = buildUserPrompt(input)
  return { systemPrompt, userPrompt }
}

function buildSystemPrompt(skill: string, permissionLevel: string, skillContent?: string): string {
  const parts: string[] = []
  const level = permissionLevel || 'read_only'

  let toolGuidance: string
  switch (level) {
    case 'read_only':
      toolGuidance = 'You have READ-ONLY access. Available tools: Read, Glob, Grep. You cannot modify files or run commands.'
      break
    case 'edit':
      toolGuidance = 'You can read and modify files. Available tools: Read, Edit, Write, Glob, Grep, Bash.'
      break
    case 'full':
      toolGuidance = 'You have full access. Available tools: Read, Edit, Write, Bash, Glob, Grep, Task.'
      break
    default:
      toolGuidance = 'You have READ-ONLY access. Available tools: Read, Glob, Grep. You cannot modify files or run commands.'
  }

  parts.push(`You are a focused execution agent with accumulated knowledge.

Your observations are your memory — read them carefully for context from previous work. You have been assigned a specific goal by the supervisor. Your skill focus is: ${skill}.

${toolGuidance}

## How to Work

- Read your observations first to understand what has already been discovered or done.
- When you discover something important, make it clear in your output.
- Signal completion or being stuck explicitly in your final message.
- Write plain text with your findings, decisions, and progress. No JSON structure is needed — the system will compress your output into observations.

## Status Signal

At the end of your work, clearly state one of these on its own line:

  STATUS: complete — you finished your goal
  STATUS: stuck — you cannot make progress and need help
  STATUS: continue — you have more work to do`)

  if (skillContent) {
    parts.push(skillContent)
  }

  return parts.join('\n\n')
}

function buildUserPrompt(input: WorkerPromptInput): string {
  const sections: string[] = []

  sections.push(`## Goal\n\n${input.goal}`)

  if (input.observationBlock) {
    sections.push(`## Observations\n\n${input.observationBlock}`)
  }

  if (input.scenarioDetail) {
    sections.push(`## Scenario\n\n${formatScenarioDetail(input.scenarioDetail)}`)
  }

  sections.push(`## Permission Level\n\n${input.permissionLevel || 'read_only'}`)

  return sections.join('\n\n')
}

function formatScenarioDetail(detail: NonNullable<WorkerPromptInput['scenarioDetail']>): string {
  const parts = [
    `**ID:** ${detail.id}`,
    `**Name:** ${detail.name}`,
    `**Stage:** ${detail.stage}`,
  ]
  if (detail.notes) parts.push(`**Notes:** ${detail.notes}`)
  if (detail.questions && detail.questions.length > 0) {
    parts.push(`**Open Questions:**\n${detail.questions.map((q) => `- ${q}`).join('\n')}`)
  }
  return parts.join('\n')
}
