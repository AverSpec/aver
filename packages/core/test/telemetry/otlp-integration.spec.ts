import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { trace } from '@opentelemetry/api'
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { createOtlpReceiver, type OtlpReceiver } from '../../src/telemetry/otlp-receiver'

/**
 * End-to-end integration test: a real OTel SDK exporting spans
 * over HTTP to our OTLP receiver. Proves the receiver works with
 * the actual wire protocol, not just hand-crafted JSON.
 */
describe('OTLP receiver integration', () => {
  let receiver: OtlpReceiver
  let provider: BasicTracerProvider

  beforeAll(async () => {
    receiver = createOtlpReceiver()
    const port = await receiver.start()

    const exporter = new OTLPTraceExporter({
      url: `http://localhost:${port}/v1/traces`,
    })
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    })
    trace.setGlobalTracerProvider(provider)
  })

  afterAll(async () => {
    await provider.shutdown()
    trace.disable()
    await receiver.stop()
  })

  it('captures spans exported by the OTel SDK', async () => {
    const tracer = trace.getTracer('integration-test', '1.0.0')

    await tracer.startActiveSpan('workspace.scenario.capture', async (span) => {
      span.setAttribute('scenario.mode', 'observed')
      span.setAttribute('scenario.id', 'test-123')
      span.end()
    })

    // SimpleSpanProcessor exports synchronously on span.end(),
    // but the HTTP request is async — give it a moment
    await new Promise(r => setTimeout(r, 50))

    const spans = receiver.getSpans()
    expect(spans).toHaveLength(1)
    expect(spans[0].name).toBe('workspace.scenario.capture')
    expect(spans[0].attributes).toMatchObject({
      'scenario.mode': 'observed',
      'scenario.id': 'test-123',
    })
  })

  it('captures multiple spans with correct attributes', async () => {
    receiver.reset()
    const tracer = trace.getTracer('integration-test', '1.0.0')

    await tracer.startActiveSpan('workspace.scenario.advance', async (span) => {
      span.setAttribute('scenario.id', 'abc')
      span.setAttribute('scenario.stage.from', 'captured')
      span.setAttribute('scenario.stage.to', 'characterized')
      span.setAttribute('advance.promoted_by', 'agent')
      span.end()
    })

    await tracer.startActiveSpan('workspace.scenario.confirm', async (span) => {
      span.setAttribute('scenario.id', 'abc')
      span.setAttribute('scenario.confirmed_by', 'nate')
      span.end()
    })

    await new Promise(r => setTimeout(r, 50))

    const spans = receiver.getSpans()
    expect(spans).toHaveLength(2)
    expect(spans[0].name).toBe('workspace.scenario.advance')
    expect(spans[0].attributes['scenario.stage.to']).toBe('characterized')
    expect(spans[1].name).toBe('workspace.scenario.confirm')
    expect(spans[1].attributes['scenario.confirmed_by']).toBe('nate')
  })

  it('works with matchSpan verification logic', async () => {
    receiver.reset()
    const tracer = trace.getTracer('integration-test', '1.0.0')

    await tracer.startActiveSpan('workspace.question.add', async (span) => {
      span.setAttribute('scenario.id', 'xyz')
      span.setAttribute('question.id', 'q-001')
      span.end()
    })

    await new Promise(r => setTimeout(r, 50))

    // Simulate what the proxy does: find a span matching a telemetry declaration
    const spans = receiver.getSpans()
    const expected = { span: 'workspace.question.add', attributes: { 'question.id': 'q-001' } }
    const matched = spans.find(s => {
      if (s.name !== expected.span) return false
      for (const [key, value] of Object.entries(expected.attributes)) {
        if (String(s.attributes[key]) !== String(value)) return false
      }
      return true
    })

    expect(matched).toBeDefined()
    expect(matched!.attributes['scenario.id']).toBe('xyz')
  })
})
