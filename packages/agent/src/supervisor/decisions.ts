import type { SupervisorDecision } from '../types.js'

const VALID_ACTION_TYPES = new Set([
  'dispatch_worker',
  'dispatch_workers',
  'ask_user',
  'checkpoint',
  'complete_story',
  'update_workspace',
  'stop',
])

export function parseDecision(text: string): SupervisorDecision {
  const json = extractJson(text)
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error(`Failed to parse supervisor decision as JSON: ${text.slice(0, 200)}`)
  }

  if (!parsed || typeof parsed !== 'object' || !('action' in parsed)) {
    throw new Error('Supervisor decision must have an "action" field')
  }

  const decision = parsed as SupervisorDecision
  if (!decision.action || typeof decision.action.type !== 'string') {
    throw new Error('Supervisor decision action must have a "type" field')
  }

  if (!VALID_ACTION_TYPES.has(decision.action.type)) {
    throw new Error(`Unknown action type: ${decision.action.type}`)
  }

  return decision
}

function extractJson(text: string): string {
  // Try to extract from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) return codeBlockMatch[1].trim()

  // Try raw JSON (starts with {)
  const jsonStart = text.indexOf('{')
  if (jsonStart >= 0) {
    let depth = 0
    for (let i = jsonStart; i < text.length; i++) {
      if (text[i] === '{') depth++
      if (text[i] === '}') depth--
      if (depth === 0) return text.slice(jsonStart, i + 1)
    }
  }

  return text
}
