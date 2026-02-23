import type { WorkerResult } from '../types.js'
import { extractJson } from '../parsing.js'

export function parseWorkerResult(text: string): WorkerResult {
  const json = extractJson(text)
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error(`Failed to parse worker result as JSON: ${text.slice(0, 200)}`)
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Worker result must be a JSON object')
  }

  const obj = parsed as Record<string, unknown>

  if (typeof obj.summary !== 'string') {
    throw new Error('Worker result must have a "summary" string field')
  }

  return {
    summary: obj.summary,
    artifacts: Array.isArray(obj.artifacts) ? obj.artifacts : [],
    scenarioUpdates: Array.isArray(obj.scenarioUpdates) ? obj.scenarioUpdates : undefined,
    suggestedNext: typeof obj.suggestedNext === 'string' ? obj.suggestedNext : undefined,
    filesChanged: Array.isArray(obj.filesChanged) ? obj.filesChanged : undefined,
    status: obj.status === 'stuck' ? 'stuck' : 'complete',
    tokenUsage: typeof obj.tokenUsage === 'number' ? obj.tokenUsage : undefined,
  }
}
