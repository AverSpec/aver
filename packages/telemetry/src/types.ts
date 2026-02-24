export interface TelemetryEvent {
  schemaVersion: '1.0.0'
  domain: string
  operation: string
  kind: 'action' | 'query' | 'assertion'
  payload: unknown
  result?: unknown
  error?: unknown
  durationMs?: number
  timestamp: string
  correlationId: string
  environment: string
}

export interface TelemetrySink {
  emit(event: TelemetryEvent): void | Promise<void>
}

export interface InstrumentOptions {
  sink: TelemetrySink
  scrub?: string[]
  environment?: string
}
