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

function validateWorkerDispatch(worker: unknown, label: string): void {
  if (!worker || typeof worker !== 'object') {
    throw new DecisionParseError({
      type: 'missing_field',
      message: `${label} must have a "worker" object`,
      field: 'worker',
      actionType: 'dispatch_worker',
    })
  }
  const w = worker as Record<string, unknown>
  if (typeof w.skill !== 'string' || w.skill.length === 0) {
    throw new DecisionParseError({
      type: 'missing_field',
      message: `${label} worker must have a "skill" string`,
      field: 'worker.skill',
      actionType: 'dispatch_worker',
    })
  }
  if (typeof w.goal !== 'string' || w.goal.length === 0) {
    throw new DecisionParseError({
      type: 'missing_field',
      message: `${label} worker must have a "goal" string`,
      field: 'worker.goal',
      actionType: 'dispatch_worker',
    })
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

  if (!parsed || typeof parsed !== 'object' || !('action' in parsed)) {
    throw new DecisionParseError({
      type: 'missing_field',
      message: 'Supervisor decision must have an "action" field',
      field: 'action',
    })
  }

  const decision = parsed as Record<string, any>
  if (!decision.action || typeof decision.action.type !== 'string') {
    throw new DecisionParseError({
      type: 'missing_field',
      message: 'Supervisor decision action must have a "type" field',
      field: 'action.type',
    })
  }

  const actionType = decision.action.type
  if (!VALID_ACTION_TYPES.has(actionType)) {
    throw new DecisionParseError({
      type: 'unknown_action',
      message: `Unknown action type: ${actionType}`,
      actionType,
    })
  }

  // Semantic validation per action type
  switch (actionType) {
    case 'dispatch_worker':
      validateWorkerDispatch(decision.action.worker, 'dispatch_worker')
      break
    case 'dispatch_workers': {
      const workers = decision.action.workers
      if (!Array.isArray(workers) || workers.length === 0) {
        throw new DecisionParseError({
          type: 'missing_field',
          message: 'dispatch_workers must have a non-empty "workers" array',
          field: 'workers',
          actionType: 'dispatch_workers',
        })
      }
      for (let i = 0; i < workers.length; i++) {
        validateWorkerDispatch(workers[i], `dispatch_workers[${i}]`)
      }
      break
    }
    case 'ask_user':
      if (typeof decision.action.question !== 'string' || decision.action.question.length === 0) {
        throw new DecisionParseError({
          type: 'missing_field',
          message: 'ask_user must have a "question" string',
          field: 'question',
          actionType: 'ask_user',
        })
      }
      break
    case 'update_workspace':
      if (!Array.isArray(decision.action.updates)) {
        throw new DecisionParseError({
          type: 'missing_field',
          message: 'update_workspace must have an "updates" array',
          field: 'updates',
          actionType: 'update_workspace',
        })
      }
      break
    case 'checkpoint':
      if (typeof decision.action.summary !== 'string' || decision.action.summary.length === 0) {
        throw new DecisionParseError({
          type: 'missing_field',
          message: 'checkpoint must have a "summary" string',
          field: 'summary',
          actionType: 'checkpoint',
        })
      }
      break
    case 'complete_story':
      if (typeof decision.action.scenarioId !== 'string' || decision.action.scenarioId.length === 0) {
        throw new DecisionParseError({
          type: 'missing_field',
          message: 'complete_story must have a "scenarioId" string',
          field: 'scenarioId',
          actionType: 'complete_story',
        })
      }
      if (typeof decision.action.summary !== 'string' || decision.action.summary.length === 0) {
        throw new DecisionParseError({
          type: 'missing_field',
          message: 'complete_story must have a "summary" string',
          field: 'summary',
          actionType: 'complete_story',
        })
      }
      break
    case 'stop':
      if (typeof decision.action.reason !== 'string' || decision.action.reason.length === 0) {
        throw new DecisionParseError({
          type: 'missing_field',
          message: 'stop must have a "reason" string',
          field: 'reason',
          actionType: 'stop',
        })
      }
      break
  }

  return decision as SupervisorDecision
}
