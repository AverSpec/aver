import type { Observation, ObservationStore } from '../db/observation-store.js'

export interface ContextWindow {
  observationBlock: string
  currentTask?: string
  suggestedContinuation?: string
}

export interface ContextAssemblerConfig {
  supervisorObservationBudget: number
  workerObservationBudget: number
}

const DEFAULT_CONFIG: ContextAssemblerConfig = {
  supervisorObservationBudget: 40_000,
  workerObservationBudget: 30_000,
}

/**
 * Format an ISO timestamp as `YYYY-MM-DD HH:MM` (drop seconds and timezone).
 */
function formatTimestamp(iso: string): string {
  // ISO format: 2026-02-26T09:15:30.000Z
  const date = iso.slice(0, 10) // YYYY-MM-DD
  const time = iso.slice(11, 16) // HH:MM
  return `${date} ${time}`
}

/**
 * Format a single observation as a plain-text line.
 * Format: `[timestamp] [priority] scope: content`
 */
function formatObservation(obs: Observation): string {
  const ts = formatTimestamp(obs.createdAt)
  return `[${ts}] [${obs.priority}] ${obs.scope}: ${obs.content}`
}

/**
 * Builds the two-block context window for any agent from the observation store.
 */
export class ContextAssembler {
  private config: ContextAssemblerConfig

  constructor(
    private store: ObservationStore,
    config?: Partial<ContextAssemblerConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async assembleForSupervisor(_agentId: string): Promise<ContextWindow> {
    const observations = await this.store.getObservationsForSupervisor()
    const block = this.formatBlock(observations, this.config.supervisorObservationBudget)
    return {
      observationBlock: block,
      currentTask: undefined,
      suggestedContinuation: undefined,
    }
  }

  async assembleForWorker(agentId: string, scenarioId: string): Promise<ContextWindow> {
    const observations = await this.store.getObservationsForWorker(agentId, scenarioId)
    const block = this.formatBlock(observations, this.config.workerObservationBudget)
    return {
      observationBlock: block,
      currentTask: undefined,
      suggestedContinuation: undefined,
    }
  }

  /**
   * Format observations into a text block, keeping the most recent
   * observations that fit within the token budget. When total tokens
   * exceed the budget, the oldest observations are dropped first.
   */
  private formatBlock(observations: Observation[], budget: number): string {
    if (observations.length === 0) return ''

    // Observations arrive in chronological order (oldest first).
    // Walk backwards from newest to find the cut point.
    let tokens = 0
    let startIndex = 0
    for (let i = observations.length - 1; i >= 0; i--) {
      const next = tokens + observations[i].tokenCount
      if (next > budget) {
        startIndex = i + 1
        break
      }
      tokens = next
    }

    return observations
      .slice(startIndex)
      .map(formatObservation)
      .join('\n')
  }
}
