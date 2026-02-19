import type { WorkerResult } from '../types.js'

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

function extractJson(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) return codeBlockMatch[1].trim()

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
