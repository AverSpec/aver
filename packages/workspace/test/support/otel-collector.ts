import { trace } from '@opentelemetry/api'
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base'
import type { TelemetryCollector } from '@aver/core'

/**
 * Creates an OTel TracerProvider backed by InMemorySpanExporter
 * and returns a TelemetryCollector compatible with aver's protocol interface.
 *
 * Call `shutdown()` in teardown to clean up the global provider.
 */
export function createOtelCollector(): {
  collector: TelemetryCollector
  shutdown: () => Promise<void>
} {
  const exporter = new InMemorySpanExporter()
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  })
  trace.setGlobalTracerProvider(provider)

  const collector: TelemetryCollector = {
    getSpans() {
      return exporter.getFinishedSpans().map(span => {
        const parentCtx = span.parentSpanContext
        return {
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId,
          parentSpanId: parentCtx && parentCtx.spanId !== '0000000000000000' ? parentCtx.spanId : undefined,
          name: span.name,
          attributes: { ...span.attributes },
          links: span.links.map(l => ({
            traceId: l.context.traceId,
            spanId: l.context.spanId,
          })),
        }
      })
    },
    reset() {
      exporter.reset()
    },
  }

  return {
    collector,
    shutdown: async () => {
      await provider.shutdown()
      trace.disable()
    },
  }
}
