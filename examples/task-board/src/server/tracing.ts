import { trace } from '@opentelemetry/api'
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

let provider: BasicTracerProvider | undefined
let tracer = trace.getTracer('task-board')

/**
 * Initialize the OTel tracing provider. Can be called with a custom endpoint
 * so the HTTP adapter test can point the exporter at Aver's OTLP receiver.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function initTracing(endpoint?: string) {
  if (provider) return
  const url = endpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces'
  const exporter = new OTLPTraceExporter({ url })
  provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  })
  trace.setGlobalTracerProvider(provider)
  tracer = provider.getTracer('task-board')
}

/** Flush all pending spans and shut down the provider. */
export async function shutdownTracing() {
  if (provider) {
    await provider.forceFlush()
    await provider.shutdown()
    trace.disable()
    provider = undefined
  }
}

/** Force-flush pending spans (without shutting down). */
export async function flushTracing() {
  if (provider) {
    await provider.forceFlush()
  }
}

// Auto-initialize when imported outside of test contexts.
// Tests can call initTracing(endpoint) before importing routes/notifications
// to redirect spans to the OTLP receiver.
if (!process.env.AVER_DEFER_TRACING_INIT) {
  initTracing()
}

export { tracer }
