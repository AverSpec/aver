import type { SupervisorDecision } from '../network/agent-network.js'
import { extractJson } from '../parsing.js'

const VALID_ACTIONS = new Set([
  'create_worker',
  'assign_goal',
  'terminate_worker',
  'advance_scenario',
  'ask_human',
  'discuss',
  'update_scenario',
  'stop',
])

export interface DecisionValidationError {
  type: 'missing_field' | 'invalid_field' | 'parse_error' | 'unknown_action'
  message: string
  field?: string
  actionType?: string
}

export class DecisionParseError extends Error {
  public readonly details: DecisionValidationError

  constructor(details: DecisionValidationError) {
    super(details.message)
    this.name = 'DecisionParseError'
    this.details = details
  }
}

export function parseDecision(text: string): SupervisorDecision {
  const json = extractJson(text)
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new DecisionParseError({
      type: 'parse_error',
      message: `Failed to parse supervisor decision as JSON: ${text.slice(0, 200)}`,
    })
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new DecisionParseError({
      type: 'missing_field',
      message: 'Supervisor decision must be a JSON object',
      field: 'action',
    })
  }

  const decision = parsed as Record<string, unknown>
  const action = decision.action

  if (typeof action !== 'string') {
    throw new DecisionParseError({
      type: 'missing_field',
      message: 'Supervisor decision must have an "action" string field',
      field: 'action',
    })
  }

  if (!VALID_ACTIONS.has(action)) {
    throw new DecisionParseError({
      type: 'unknown_action',
      message: `Unknown action type: ${action}`,
      actionType: action,
    })
  }

  // Semantic validation per action type
  switch (action) {
    case 'create_worker':
      if (typeof decision.goal !== 'string' || decision.goal.length === 0) {
        throw new DecisionParseError({
          type: 'missing_field',
          message: 'create_worker must have a "goal" string',
          field: 'goal',
          actionType: 'create_worker',
        })
      }
      if (typeof decision.skill !== 'string' || decision.skill.length === 0) {
        throw new DecisionParseError({
          type: 'missing_field',
          message: 'create_worker must have a "skill" string',
          field: 'skill',
          actionType: 'create_worker',
        })
      }
      break
    case 'assign_goal':
      if (typeof decision.agentId !== 'string' || decision.agentId.length === 0) {
        throw new DecisionParseError({
          type: 'missing_field',
          message: 'assign_goal must have an "agentId" string',
          field: 'agentId',
          actionType: 'assign_goal',
        })
      }
      if (typeof decision.goal !== 'string' || decision.goal.length === 0) {
        throw new DecisionParseError({
          type: 'missing_field',
          message: 'assign_goal must have a "goal" string',
          field: 'goal',
          actionType: 'assign_goal',
        })
      }
      break
    case 'terminate_worker':
      if (typeof decision.agentId !== 'string' || decision.agentId.length === 0) {
        throw new DecisionParseError({
          type: 'missing_field',
          message: 'terminate_worker must have an "agentId" string',
          field: 'agentId',
          actionType: 'terminate_worker',
        })
      }
      break
    case 'advance_scenario':
      if (typeof decision.scenarioId !== 'string' || decision.scenarioId.length === 0) {
        throw new DecisionParseError({
          type: 'missing_field',
          message: 'advance_scenario must have a "scenarioId" string',
          field: 'scenarioId',
          actionType: 'advance_scenario',
        })
      }
      break
    case 'ask_human':
      if (typeof decision.question !== 'string' || decision.question.length === 0) {
        throw new DecisionParseError({
          type: 'missing_field',
          message: 'ask_human must have a "question" string',
          field: 'question',
          actionType: 'ask_human',
        })
      }
      break
    case 'discuss':
      if (typeof decision.message !== 'string' || decision.message.length === 0) {
        throw new DecisionParseError({
          type: 'missing_field',
          message: 'discuss must have a "message" string',
          field: 'message',
          actionType: 'discuss',
        })
      }
      break
    case 'update_scenario':
      if (typeof decision.scenarioId !== 'string' || decision.scenarioId.length === 0) {
        throw new DecisionParseError({
          type: 'missing_field',
          message: 'update_scenario must have a "scenarioId" string',
          field: 'scenarioId',
          actionType: 'update_scenario',
        })
      }
      if (!decision.updates || typeof decision.updates !== 'object') {
        throw new DecisionParseError({
          type: 'missing_field',
          message: 'update_scenario must have an "updates" object',
          field: 'updates',
          actionType: 'update_scenario',
        })
      }
      break
    case 'stop':
      // reason is optional in the type
      break
  }

  return decision as unknown as SupervisorDecision
}
