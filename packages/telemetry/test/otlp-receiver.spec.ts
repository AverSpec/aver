import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createOtlpReceiver, type OtlpReceiver } from '../src/otlp-receiver'

// OTLP receiver tests require server.listen which fails with EPERM in GitHub Actions
const isCI = !!process.env.CI

function otlpPayload(spans: Array<{
  name: string
  traceId?: string
  spanId?: string
  parentSpanId?: string
  attributes?: Array<{ key: string; value: Record<string, unknown> }>
}>) {
  return {
    resourceSpans: [{
      scopeSpans: [{
        spans: spans.map(s => ({
          traceId: s.traceId ?? '',
          spanId: s.spanId ?? '',
          parentSpanId: s.parentSpanId ?? '',
          name: s.name,
          attributes: s.attributes ?? [],
        })),
      }],
    }],
  }
}

async function postTraces(port: number, body: unknown) {
  return fetch(`http://localhost:${port}/v1/traces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe.skipIf(isCI)('OtlpReceiver', () => {
  let receiver: OtlpReceiver

  beforeEach(async () => {
    receiver = createOtlpReceiver()
    await receiver.start()
  })

  afterEach(async () => {
    await receiver.stop()
  })

  it('collects spans from a valid OTLP payload', async () => {
    const res = await postTraces(receiver.port, otlpPayload([
      { name: 'my-span', attributes: [{ key: 'service', value: { stringValue: 'test' } }] },
    ]))

    expect(res.status).toBe(200)
    const [span] = receiver.getSpans()
    expect(span.name).toBe('my-span')
    expect(span.attributes).toEqual({ service: 'test' })
    expect(span.traceId).toBe('')
    expect(span.spanId).toBe('')
  })

  it('converts all attribute types', async () => {
    await postTraces(receiver.port, otlpPayload([{
      name: 'typed-span',
      attributes: [
        { key: 'str', value: { stringValue: 'hello' } },
        { key: 'num', value: { intValue: '42' } },
        { key: 'flag', value: { boolValue: true } },
        { key: 'ratio', value: { doubleValue: 3.14 } },
      ],
    }]))

    const [span] = receiver.getSpans()
    expect(span.attributes).toEqual({
      str: 'hello',
      num: 42,
      flag: true,
      ratio: 3.14,
    })
  })

  it('resets collected spans', async () => {
    await postTraces(receiver.port, otlpPayload([{ name: 'a' }]))
    expect(receiver.getSpans()).toHaveLength(1)

    receiver.reset()
    expect(receiver.getSpans()).toHaveLength(0)
  })

  it('handles multiple resourceSpans and scopeSpans', async () => {
    const body = {
      resourceSpans: [
        {
          scopeSpans: [
            { spans: [{ name: 'r1-s1', attributes: [] }] },
            { spans: [{ name: 'r1-s2', attributes: [] }] },
          ],
        },
        {
          scopeSpans: [
            { spans: [{ name: 'r2-s1', attributes: [] }] },
          ],
        },
      ],
    }

    await postTraces(receiver.port, body)

    const names = receiver.getSpans().map(s => s.name)
    expect(names).toEqual(['r1-s1', 'r1-s2', 'r2-s1'])
  })

  it('rejects oversized request bodies with 413', async () => {
    // Build a body that exceeds the 1 MB default limit
    const oversized = JSON.stringify({
      resourceSpans: [{ scopeSpans: [{ spans: [{ name: 'x'.repeat(1_100_000) }] }] }],
    })

    const res = await fetch(`http://localhost:${receiver.port}/v1/traces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: oversized,
    })

    expect(res.status).toBe(413)
    const json = await res.json()
    expect(json.error).toMatch(/exceeds/)
  })

  it('returns 415 for application/x-protobuf content-type', async () => {
    const res = await fetch(`http://localhost:${receiver.port}/v1/traces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-protobuf' },
      body: new Uint8Array([0x0a, 0x00]),
    })

    expect(res.status).toBe(415)
    const json = await res.json()
    expect(json.error).toMatch(/Unsupported content-type/)
    expect(json.error).toMatch(/OTLP\/HTTP JSON/)
  })

  it('returns 415 for application/grpc content-type', async () => {
    const res = await fetch(`http://localhost:${receiver.port}/v1/traces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/grpc' },
      body: new Uint8Array([0x0a, 0x00]),
    })

    expect(res.status).toBe(415)
    const json = await res.json()
    expect(json.error).toMatch(/Unsupported content-type/)
  })

  it('stops cleanly', async () => {
    await receiver.stop()
    // Fetching after stop should fail
    await expect(postTraces(receiver.port, otlpPayload([{ name: 'x' }]))).rejects.toThrow()
  })
})
