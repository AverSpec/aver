import type { ObservationStore, Observation } from '../db/observation-store.js'
import { estimateTokens } from '../db/tokens.js'
import { REFLECTOR_SYSTEM_PROMPT, buildReflectorUserPrompt } from './reflector-prompt.js'

export interface ReflectorResult {
  level: number
  inputTokens: number
  outputTokens: number
  degenerate: boolean
}

export type DispatchFn = (systemPrompt: string, userPrompt: string) => Promise<string>

export interface ReflectorConfig {
  threshold: number
}

const MAX_LEVEL = 3

/**
 * Parse LLM output into observation lines with priorities.
 * Expects `<observations>...</observations>` wrapping `[priority] content` lines.
 */
function parseObservations(
  raw: string,
): Array<{ priority: Observation['priority']; content: string }> {
  const match = raw.match(/<observations>([\s\S]*?)<\/observations>/)
  if (!match) return []

  const lines = match[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const results: Array<{ priority: Observation['priority']; content: string }> = []
  for (const line of lines) {
    const m = line.match(/^\[(critical|important|informational)\]\s*(.+)$/)
    if (m) {
      results.push({
        priority: m[1] as Observation['priority'],
        content: m[2],
      })
    }
  }
  return results
}

/**
 * Check if the LLM flagged degenerate/repetitive content.
 */
function parseDegenerate(raw: string): boolean {
  const match = raw.match(/<degenerate>\s*(true)\s*<\/degenerate>/)
  return match !== null
}

/**
 * Format observations into text for the LLM prompt.
 */
function formatObservations(observations: Observation[]): string {
  return observations.map((o) => `[${o.priority}] ${o.content}`).join('\n')
}

export class Reflector {
  constructor(
    private store: ObservationStore,
    private dispatch: DispatchFn,
    private config: ReflectorConfig = { threshold: 40_000 },
  ) {}

  async reflect(scope: string): Promise<ReflectorResult> {
    const observations = await this.store.getObservations(scope)
    const inputTokens = observations.reduce((sum, o) => sum + o.tokenCount, 0)

    // Under threshold — no work needed
    if (inputTokens < this.config.threshold) {
      return {
        level: -1,
        inputTokens,
        outputTokens: inputTokens,
        degenerate: false,
      }
    }

    let bestResult: ReflectorResult | undefined
    let bestOutputTokens = inputTokens
    let bestParsed: Array<{ priority: Observation['priority']; content: string }> | undefined
    let bestDegenerate = false

    for (let level = 0; level <= MAX_LEVEL; level++) {
      const observationText = formatObservations(observations)
      const userPrompt = buildReflectorUserPrompt(level, observationText)
      const raw = await this.dispatch(REFLECTOR_SYSTEM_PROMPT, userPrompt)

      const parsed = parseObservations(raw)
      const degenerate = parseDegenerate(raw)
      const outputTokens = parsed.reduce(
        (sum, p) => sum + estimateTokens(`[${p.priority}] ${p.content}`),
        0,
      )

      // Compression succeeded if output is smaller
      if (outputTokens < inputTokens) {
        // Track the best result achieved
        if (outputTokens < bestOutputTokens) {
          bestOutputTokens = outputTokens
          bestParsed = parsed
          bestDegenerate = degenerate
          bestResult = {
            level,
            inputTokens,
            outputTokens,
            degenerate,
          }
        }

        // If we're under threshold, we're done
        if (outputTokens < this.config.threshold) {
          break
        }
      }
      // If output >= input, compression failed at this level — try next
    }

    // If no level produced a smaller output, return no-op result
    if (!bestResult || !bestParsed) {
      return {
        level: MAX_LEVEL,
        inputTokens,
        outputTokens: inputTokens,
        degenerate: false,
      }
    }

    // Write new compressed observations and supersede old ones
    // We need a single agentId — use the first observation's (or 'reflector')
    const agentId = observations.length > 0 ? observations[0].agentId : 'reflector'

    const newIds: string[] = []
    for (const parsed of bestParsed) {
      const newObs = await this.store.addObservation({
        agentId,
        scope,
        priority: parsed.priority,
        content: parsed.content,
        tokenCount: estimateTokens(`[${parsed.priority}] ${parsed.content}`),
      })
      newIds.push(newObs.id)
    }

    // Mark all old observations as superseded by the first new observation
    const supersededById = newIds[0]
    if (supersededById) {
      for (const old of observations) {
        await this.store.supersede(old.id, supersededById)
      }
    }

    return {
      ...bestResult,
      degenerate: bestDegenerate,
    }
  }
}
