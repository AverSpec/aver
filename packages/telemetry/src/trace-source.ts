import { readFile } from 'node:fs/promises'
import type { ProductionTrace, ProductionSpan } from './verify'
import { parseAttributes, normalizeParentSpanId } from './otlp-parse'

/** Source of production traces for contract verification. */
export interface TraceSource {
  fetch(): Promise<ProductionTrace[]>
}

/** Reads production traces from an OTLP JSON file on disk. */
export class FileTraceSource implements TraceSource {
  constructor(private readonly filePath: string) {}

  async fetch(): Promise<ProductionTrace[]> {
    let raw: string
    try {
      raw = await readFile(this.filePath, 'utf-8')
    } catch (err: any) {
      throw new Error(`Failed to read trace file: ${this.filePath}`, { cause: err })
    }

    let body: any
    try {
      body = JSON.parse(raw)
    } catch (err: any) {
      throw new Error(`Failed to parse JSON from trace file: ${this.filePath}`, { cause: err })
    }

    const traceMap = new Map<string, ProductionSpan[]>()

    for (const rs of body.resourceSpans ?? []) {
      for (const ss of rs.scopeSpans ?? []) {
        for (const span of ss.spans ?? []) {
          const traceId = span.traceId ?? ''
          const parsed: ProductionSpan = {
            name: span.name,
            spanId: span.spanId,
            parentSpanId: normalizeParentSpanId(span.parentSpanId),
            attributes: parseAttributes(span.attributes),
          }

          if (!traceMap.has(traceId)) {
            traceMap.set(traceId, [])
          }
          traceMap.get(traceId)!.push(parsed)
        }
      }
    }

    const traces: ProductionTrace[] = []
    for (const [traceId, spans] of traceMap) {
      traces.push({ traceId, spans })
    }
    return traces
  }
}
