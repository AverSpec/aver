import type { EventSource, TelemetryEvent } from '../types.js'

export function memorySource(events: TelemetryEvent[]): EventSource {
  return {
    async load(): Promise<TelemetryEvent[]> {
      return [...events]
    },
  }
}
