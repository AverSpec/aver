import type { ObservationStore } from '../db/observation-store.js'
import { estimateTokens } from '../db/tokens.js'
import {
  OBSERVER_SYSTEM_PROMPT,
  formatMessagesPrompt,
  type Message,
} from './observer-prompt.js'

export type { Message }

export interface ObserverResult {
  observations: Array<{
    scope: string
    priority: 'critical' | 'important' | 'informational'
    content: string
    referencedAt?: string
  }>
  currentTask?: string
  suggestedContinuation?: string
}

export type DispatchFn = (
  systemPrompt: string,
  userPrompt: string,
) => Promise<string>

const VALID_PRIORITIES = new Set(['critical', 'important', 'informational'])

/**
 * Parse priority tag from a line like "[critical] Some content".
 * Returns null if the line doesn't match.
 */
function parsePriorityLine(
  line: string,
): {
  priority: 'critical' | 'important' | 'informational'
  content: string
} | null {
  const match = line.match(/^\[(\w+)\]\s+(.+)$/)
  if (!match) return null

  const priority = match[1].toLowerCase()
  if (!VALID_PRIORITIES.has(priority)) return null

  return {
    priority: priority as 'critical' | 'important' | 'informational',
    content: match[2].trim(),
  }
}

/**
 * Extract content between XML-like tags, e.g. <tag>content</tag>.
 * Returns undefined if the tag is not found.
 */
function extractTag(response: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)
  const match = response.match(regex)
  return match ? match[1].trim() : undefined
}

/**
 * Extract an ISO date string from observation content, if present.
 * Looks for patterns like 2026-02-25, 2026-02-25T10:00:00, etc.
 */
function extractDateReference(content: string): string | undefined {
  const match = content.match(
    /\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?/,
  )
  return match ? match[0] : undefined
}

export class Observer {
  constructor(
    private store: ObservationStore,
    private dispatch: DispatchFn,
  ) {}

  async observe(
    agentId: string,
    scope: string,
    messages: Message[],
  ): Promise<ObserverResult> {
    if (messages.length === 0) {
      return { observations: [] }
    }

    const userPrompt = formatMessagesPrompt(messages)
    const response = await this.dispatch(OBSERVER_SYSTEM_PROMPT, userPrompt)

    const result = this.parseResponse(response, scope)

    // Write each observation to the store
    for (const obs of result.observations) {
      const tokenCount = estimateTokens(obs.content)
      await this.store.addObservation({
        agentId,
        scope: obs.scope,
        priority: obs.priority,
        content: obs.content,
        tokenCount,
        referencedAt: obs.referencedAt,
      })
    }

    return result
  }

  private parseResponse(response: string, scope: string): ObserverResult {
    const observationsBlock = extractTag(response, 'observations')
    const currentTask = extractTag(response, 'current-task')
    const suggestedContinuation = extractTag(
      response,
      'suggested-continuation',
    )

    // Parse observation lines
    const observations: ObserverResult['observations'] = []

    if (observationsBlock !== undefined) {
      const lines = observationsBlock
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)

      for (const line of lines) {
        const parsed = parsePriorityLine(line)
        if (parsed) {
          observations.push({
            scope,
            priority: parsed.priority,
            content: parsed.content,
            referencedAt: extractDateReference(parsed.content),
          })
        }
      }
    }

    // Fallback: if no observations were parsed, treat entire response as one important observation
    if (observations.length === 0 && response.trim().length > 0) {
      observations.push({
        scope,
        priority: 'important',
        content: response.trim(),
        referencedAt: extractDateReference(response),
      })
    }

    return {
      observations,
      currentTask,
      suggestedContinuation,
    }
  }
}
