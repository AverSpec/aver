import type { Observer, ObserverResult, Message } from './observer.js'

export interface BufferConfig {
  /** Tokens before activation (default 30000) */
  activationThreshold: number
  /** Fraction of threshold for buffer interval (default 0.2) */
  bufferIntervalRatio: number
}

const DEFAULT_CONFIG: BufferConfig = {
  activationThreshold: 30_000,
  bufferIntervalRatio: 0.2,
}

/**
 * Compute the effective buffer interval based on how close pendingTokens
 * is to the activation threshold.
 *
 * - Base interval = activationThreshold * bufferIntervalRatio
 * - >50% of threshold: interval halves
 * - >75% of threshold: interval halves again
 */
function effectiveInterval(
  pendingTokens: number,
  config: BufferConfig,
): number {
  let interval = config.activationThreshold * config.bufferIntervalRatio
  if (pendingTokens > config.activationThreshold * 0.75) {
    interval /= 4
  } else if (pendingTokens > config.activationThreshold * 0.5) {
    interval /= 2
  }
  return interval
}

/**
 * Pre-computes observations in the background so that when the activation
 * threshold is hit, buffered observations swap in atomically with no
 * blocking LLM call.
 */
export class ObservationBuffer {
  private buffering = new Set<string>()
  private buffers = new Map<string, ObserverResult>()
  private lastTriggered = new Map<string, number>()

  constructor(
    private observer: Observer,
    private config: BufferConfig = DEFAULT_CONFIG,
  ) {}

  /** Compound key to isolate buffer state per (agentId, scope) pair. */
  private key(agentId: string, scope: string): string {
    return `${agentId}:${scope}`
  }

  /**
   * Called when new messages arrive. Decides whether to trigger background
   * observation based on interval boundaries and concurrency state.
   */
  async onNewMessages(
    agentId: string,
    scope: string,
    messages: Message[],
    pendingTokens: number,
  ): Promise<void> {
    const k = this.key(agentId, scope)

    // Skip if already buffering for this agent+scope
    if (this.buffering.has(k)) return

    const interval = effectiveInterval(pendingTokens, this.config)

    // Determine which interval boundary pendingTokens falls into
    const currentBoundary = Math.floor(pendingTokens / interval)

    // Only trigger if we've crossed a new boundary since the last trigger
    const lastBoundary = this.lastTriggered.get(k) ?? 0
    if (currentBoundary <= lastBoundary || currentBoundary === 0) return

    this.lastTriggered.set(k, currentBoundary)
    this.buffering.add(k)

    // Fire-and-forget: run Observer in the background
    this.observer
      .observe(agentId, scope, messages)
      .then((result) => {
        this.buffers.set(k, result)
      })
      .catch((err) => {
        // Observation failed — nothing to buffer, just clear state
        console.error('[aver] observation failed:', err)
      })
      .finally(() => {
        this.buffering.delete(k)
      })
  }

  /**
   * Called when activation threshold is hit. Returns buffered observations
   * if ready, then clears the buffer.
   */
  async activate(
    agentId: string,
    scope: string,
  ): Promise<ObserverResult | null> {
    const k = this.key(agentId, scope)
    const result = this.buffers.get(k) ?? null
    this.buffers.delete(k)
    this.lastTriggered.delete(k)
    return result
  }

  /** Check if currently buffering for an agent+scope pair. */
  isBuffering(agentId: string, scope: string): boolean {
    return this.buffering.has(this.key(agentId, scope))
  }
}
