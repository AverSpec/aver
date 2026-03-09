// --- Trigger Types ---

export type TriggerType =
  | 'worker:critical'
  | 'worker:stuck'
  | 'worker:goal_complete'
  | 'worker:terminated'
  | 'observation:threshold'
  | 'human:message'
  | 'human:confirm'
  | 'session:start'

export interface Trigger {
  type: TriggerType
  agentId?: string
  data?: Record<string, unknown>
  timestamp: string
}

export type TriggerCallback = (triggers: Trigger[]) => void

/**
 * Event queue for supervisor wake triggers.
 *
 * When the supervisor is idle, incoming triggers fire the callback immediately.
 * When the supervisor is active, triggers are queued and delivered as a batch
 * on markIdle(). All triggers are preserved — multiple same-type triggers
 * (e.g. two worker completions) are kept so none are silently dropped.
 */
export class TriggerQueue {
  private queue: Trigger[] = []
  private callback: TriggerCallback | undefined
  private active = false

  /**
   * Push a trigger. If supervisor is idle and a callback is registered,
   * fires callback immediately. Otherwise queues for later delivery.
   */
  push(trigger: Trigger): void {
    if (!this.active && this.callback) {
      this.callback([trigger])
    } else {
      this.queue.push(trigger)
    }
  }

  /** Mark supervisor as active. Subsequent triggers are queued. */
  markActive(): void {
    this.active = true
  }

  /**
   * Mark supervisor as idle. If queued triggers exist, fires callback
   * with the full batch and clears the queue.
   */
  markIdle(): void {
    this.active = false
    if (this.queue.length > 0 && this.callback) {
      const batch = this.queue.slice()
      this.queue.length = 0
      this.callback(batch)
    }
  }

  /** Register the callback for when triggers should be delivered. */
  onTrigger(callback: TriggerCallback): void {
    this.callback = callback
  }

  /** Pending trigger count (for debugging/monitoring). */
  get pendingCount(): number {
    return this.queue.length
  }

  /** Whether the supervisor is currently active. */
  get isActive(): boolean {
    return this.active
  }
}
