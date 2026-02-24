import type { TelemetrySink, TelemetryEvent } from '../types.js'

export interface OTelSinkOptions {
  serviceName: string
}

/**
 * OTel-format sink — emits events as JSON with OTel-compatible fields
 * (`service.name`, `otel.kind`). Does NOT require the OTel SDK.
 *
 * For full OTel SDK integration (traces/spans), implement a custom
 * `TelemetrySink` using `@opentelemetry/api` directly.
 */
export function otelFormatSink(opts: OTelSinkOptions): TelemetrySink {
  return {
    emit(event: TelemetryEvent): void {
      // Structured output compatible with OTel event format
      // Full OTel SDK integration deferred to v1.x
      console.log(JSON.stringify({
        ...event,
        'service.name': opts.serviceName,
        'otel.kind': event.kind === 'query' ? 'CLIENT' : 'INTERNAL',
      }))
    },
  }
}
