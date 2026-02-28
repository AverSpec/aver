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

  private formatBlock(observations: Observation[], budget: number): string {
    if (observations.length === 0) return ''
    const lines: string[] = []
    let tokens = 0
    for (const obs of observations) {
      tokens += obs.tokenCount
      if (tokens > budget) break
      lines.push(formatObservation(obs))
    }
    return lines.join('\n')
  }
}
