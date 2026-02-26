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
 * Event queue with debounce logic for supervisor wake triggers.
 *
 * When the supervisor is idle, incoming triggers fire the callback immediately.
 * When the supervisor is active, triggers are queued and debounced by type
 * (only the most recent trigger per type is kept). On markIdle(), any queued
 * triggers are delivered as a batch.
 */
export class TriggerQueue {
  private queue: Map<TriggerType, Trigger> = new Map()
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
      // Debounce: overwrite any existing trigger of the same type
      this.queue.set(trigger.type, trigger)
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
    if (this.queue.size > 0 && this.callback) {
      const batch = Array.from(this.queue.values())
      this.queue.clear()
      this.callback(batch)
    }
  }

  /** Register the callback for when triggers should be delivered. */
  onTrigger(callback: TriggerCallback): void {
    this.callback = callback
  }

  /** Pending trigger count (for debugging/monitoring). */
  get pendingCount(): number {
    return this.queue.size
  }

  /** Whether the supervisor is currently active. */
  get isActive(): boolean {
    return this.active
  }
}
