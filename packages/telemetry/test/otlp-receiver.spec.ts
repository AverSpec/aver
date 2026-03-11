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

  it('stops cleanly', async () => {
    await receiver.stop()
    // Fetching after stop should fail
    await expect(postTraces(receiver.port, otlpPayload([{ name: 'x' }]))).rejects.toThrow()
  })
})
