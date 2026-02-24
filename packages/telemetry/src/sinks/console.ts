import type { TelemetrySink, TelemetryEvent } from '../types.js'

export function consoleSink(): TelemetrySink {
  return {
    emit(event: TelemetryEvent): void {
      console.log(JSON.stringify(event))
    },
  }
}
