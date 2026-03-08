import { describe, it, expect, beforeEach } from 'vitest'
import { context, trace } from '@opentelemetry/api'
import { BasicTracerProvider, SimpleSpanProcessor, InMemorySpanExporter, type ReadableSpan } from '@opentelemetry/sdk-trace-base'
import type { CollectedSpan } from '../../src/core/protocol'

/**
 * example-span-collection: proves CollectedSpan captures
 * traceId, spanId, parentSpanId, and links from OTel spans.
 */
describe('example-span-collection', () => {
  let provider: BasicTracerProvider
  let exporter: InMemorySpanExporter

  function toCollectedSpan(s: ReadableSpan): CollectedSpan {
    const parentCtx = s.parentSpanContext
    return {
      traceId: s.spanContext().traceId,
      spanId: s.spanContext().spanId,
      parentSpanId: parentCtx && parentCtx.spanId !== '0000000000000000' ? parentCtx.spanId : undefined,
      name: s.name,
      attributes: { ...s.attributes },
      links: s.links.map(l => ({
        traceId: l.context.traceId,
        spanId: l.context.spanId,
      })),
    }
  }

  function getCollectedSpans(): CollectedSpan[] {
    return exporter.getFinishedSpans().map(toCollectedSpan)
  }

  beforeEach(() => {
    exporter = new InMemorySpanExporter()
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    })
  })

  it('collected span has traceId and spanId as non-empty hex strings', () => {
    const tracer = provider.getTracer('test')
    const span = tracer.startSpan('test.action')
    span.end()

    const [collected] = getCollectedSpans()
    expect(collected.traceId).toMatch(/^[0-9a-f]{32}$/)
    expect(collected.spanId).toMatch(/^[0-9a-f]{16}$/)
  })

  it('root span has no parentSpanId', () => {
    const tracer = provider.getTracer('test')
    const span = tracer.startSpan('test.root')
    span.end()

    const [collected] = getCollectedSpans()
    expect(collected.parentSpanId).toBeUndefined()
  })

  it('child span carries parentSpanId matching parent spanId', () => {
    const tracer = provider.getTracer('test')

    const parentSpan = tracer.startSpan('test.parent')
    const parentCtx = trace.setSpan(context.active(), parentSpan)
    const childSpan = tracer.startSpan('test.child', {}, parentCtx)
    childSpan.end()
    parentSpan.end()

    const spans = getCollectedSpans()
    const parent = spans.find(s => s.name === 'test.parent')!
    const child = spans.find(s => s.name === 'test.child')!

    expect(child.parentSpanId).toBe(parent.spanId)
    expect(child.traceId).toBe(parent.traceId)
  })

  it('span with link carries link data', () => {
    const tracer = provider.getTracer('test')

    // Create an upstream span to link to
    const upstream = tracer.startSpan('test.upstream')
    const upstreamCtx = upstream.spanContext()
    upstream.end()

    // Create a linked span
    const linked = tracer.startSpan('test.linked', {
      links: [{ context: upstreamCtx }],
    })
    linked.end()

    const spans = getCollectedSpans()
    const linkedSpan = spans.find(s => s.name === 'test.linked')!

    expect(linkedSpan.links).toHaveLength(1)
    expect(linkedSpan.links![0].traceId).toBe(upstreamCtx.traceId)
    expect(linkedSpan.links![0].spanId).toBe(upstreamCtx.spanId)
  })

  it('span without links has empty links array', () => {
    const tracer = provider.getTracer('test')
    const span = tracer.startSpan('test.nolinks')
    span.end()

    const [collected] = getCollectedSpans()
    expect(collected.links).toEqual([])
  })
})
