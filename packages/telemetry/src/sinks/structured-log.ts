import type { TelemetrySink, TelemetryEvent } from '../types.js'

export interface StructuredLogSinkOptions {
  serviceName: string
}

/**
 * Structured-log sink — emits events as JSON with service metadata fields
 * (`service.name`, `otel.kind`). Does NOT require the OTel SDK.
 *
 * For full OTel SDK integration (traces/spans), implement a custom
 * `TelemetrySink` using `@opentelemetry/api` directly.
 */
export function structuredLogSink(opts: StructuredLogSinkOptions): TelemetrySink {
  return {
    emit(event: TelemetryEvent): void {
      console.log(JSON.stringify({
        ...event,
        'service.name': opts.serviceName,
        'otel.kind': event.kind === 'query' ? 'CLIENT' : 'INTERNAL',
      }))
    },
  }
}
