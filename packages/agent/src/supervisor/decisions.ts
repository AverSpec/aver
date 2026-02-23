import type { SupervisorDecision } from '../types.js'
import { extractJson } from '../parsing.js'

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
