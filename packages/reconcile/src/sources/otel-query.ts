import type { EventSource, TelemetryEvent } from '../types.js'

export interface OTelQueryOptions {
  /** HTTP endpoint URL that returns trace/event data */
  endpoint: string
  /** Optional HTTP headers (e.g., for auth tokens) */
  headers?: Record<string, string>
  /** Query parameters appended to the endpoint URL */
  query?: Record<string, string>
  /**
   * Transform the raw JSON response into TelemetryEvents.
   * Use this to adapt backend-specific response shapes (Tempo, Jaeger, etc.).
   * Defaults to treating the response as `TelemetryEvent[]`.
   */
  mapResponse?: (data: unknown) => TelemetryEvent[]
}

export function otelQuerySource(opts: OTelQueryOptions): EventSource {
  return {
    async load(): Promise<TelemetryEvent[]> {
      const url = new URL(opts.endpoint)
      if (opts.query) {
        for (const [k, v] of Object.entries(opts.query)) {
          url.searchParams.set(k, v)
        }
      }

      const response = await fetch(url.toString(), {
        headers: opts.headers,
      })

      if (!response.ok) {
        throw new Error(
          `OTel query failed: ${response.status} ${response.statusText}`
        )
      }

      const data: unknown = await response.json()
      return opts.mapResponse ? opts.mapResponse(data) : data as TelemetryEvent[]
    },
  }
}
