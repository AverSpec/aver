import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import type { CollectedSpan, TelemetryCollector } from '@aver/core'
import { parseAttributes, normalizeParentSpanId } from './otlp-parse'

export interface OtlpReceiver extends TelemetryCollector {
  start(): Promise<number>
  stop(): Promise<void>
  port: number
}

/** Default body size limit: 1 MB */
const MAX_BODY_BYTES = 1_048_576

class BodyTooLargeError extends Error {
  constructor(limit: number) {
    super(`Request body exceeds the ${limit}-byte limit`)
    this.name = 'BodyTooLargeError'
  }
}

function readBody(req: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let received = 0
    let exceeded = false
    req.on('data', (c: Buffer) => {
      received += c.length
      if (received > maxBytes) {
        exceeded = true
        // Stop buffering but let the stream finish so the socket stays open for the response
        chunks.length = 0
        return
      }
      if (!exceeded) chunks.push(c)
    })
    req.on('end', () => {
      if (exceeded) reject(new BodyTooLargeError(maxBytes))
      else resolve(Buffer.concat(chunks).toString())
    })
    req.on('error', reject)
  })
}

export function createOtlpReceiver(): OtlpReceiver {
  const spans: CollectedSpan[] = []
  let server: Server | undefined
  let currentPort = 0

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'POST' && req.url === '/v1/traces') {
      let body: any
      try {
        body = JSON.parse(await readBody(req))
      } catch (err) {
        if (err instanceof BodyTooLargeError) {
          res.writeHead(413, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
          return
        }
        const contentType = req.headers['content-type'] ?? '(none)'
        console.warn(
          `[aver] OTLP receiver: failed to parse request body as JSON (content-type: ${contentType}).`,
          'If your exporter is sending protobuf, configure it to use JSON (OTLP/HTTP JSON).',
          err,
        )
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON body' }))
        return
      }
      for (const rs of body.resourceSpans ?? []) {
        for (const ss of rs.scopeSpans ?? []) {
          for (const span of ss.spans ?? []) {
            const parentSpanId = normalizeParentSpanId(span.parentSpanId)
            const links = (span.links ?? []).map((l: any) => ({
              traceId: l.spanContext?.traceId ?? l.traceId ?? '',
              spanId: l.spanContext?.spanId ?? l.spanId ?? '',
            }))
            spans.push({
              traceId: span.traceId ?? '',
              spanId: span.spanId ?? '',
              parentSpanId,
              name: span.name,
              attributes: parseAttributes(span.attributes),
              links: links.length > 0 ? links : undefined,
            })
          }
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{}')
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: `Unsupported path: ${req.method} ${req.url}` }))
  }

  return {
    get port() { return currentPort },

    getSpans() { return [...spans] },

    reset() { spans.length = 0 },

    start() {
      return new Promise<number>((resolve, reject) => {
        server = createServer(handler)
        server.listen(0, () => {
          const addr = server!.address()
          currentPort = typeof addr === 'object' && addr ? addr.port : 0
          resolve(currentPort)
        })
        server.on('error', reject)
      })
    },

    stop() {
      return new Promise<void>((resolve, reject) => {
        if (!server) return resolve()
        server.close((err) => (err ? reject(err) : resolve()))
        server = undefined
      })
    },
  }
}
