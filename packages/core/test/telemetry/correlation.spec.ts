import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { type Context as OtelContext, context, trace } from '@opentelemetry/api'
import { BasicTracerProvider, SimpleSpanProcessor, InMemorySpanExporter } from '@opentelemetry/sdk-trace-base'
import { defineDomain, action,  implement } from '../../src/index'
import { runTestWithAdapter } from '../../src/core/test-runner'
import type { Protocol, TelemetryCollector, CollectedSpan } from '../../src/core/protocol'

/**
 * example-order-flow: proves end-of-test correlation verification
 * (attribute correlation + causal connection).
 *
 * checkout and fulfillOrder share 'order.id' — correlated.
 * sendConfirmation has 'email.recipient' only — uncorrelated by design.
 */

const orderFlow = defineDomain({
  name: 'example-order-flow',
  actions: {
    checkout: action<{ orderId: string }>({
      telemetry: (p) => ({
        span: 'order.checkout',
        attributes: { 'order.id': p.orderId },
      }),
    }),
    fulfillOrder: action<{ orderId: string }>({
      telemetry: (p) => ({
        span: 'order.fulfill',
        attributes: { 'order.id': p.orderId },
      }),
    }),
    sendConfirmation: action<{ email: string }>({
      telemetry: (p) => ({
        span: 'notification.send',
        attributes: { 'email.recipient': p.email },
      }),
    }),
  },
  queries: {},
  assertions: {},
})

// --- OTel in-process setup ---

function createInProcessCollector() {
  const exporter = new InMemorySpanExporter()
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  })

  const collector: TelemetryCollector = {
    getSpans(): CollectedSpan[] {
      return exporter.getFinishedSpans().map(s => {
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
      })
    },
    reset() {
      exporter.reset()
    },
  }

  return { provider, exporter, collector }
}

describe('example-order-flow: correlation verification', () => {
  let provider: BasicTracerProvider
  let collector: TelemetryCollector
  let prevMode: string | undefined

  beforeEach(() => {
    const setup = createInProcessCollector()
    provider = setup.provider
    collector = setup.collector
    trace.setGlobalTracerProvider(provider)
    prevMode = process.env.AVER_TELEMETRY_MODE
    process.env.AVER_TELEMETRY_MODE = 'fail'
  })

  afterEach(async () => {
    await provider.shutdown()
    trace.disable()
    if (prevMode === undefined) delete process.env.AVER_TELEMETRY_MODE
    else process.env.AVER_TELEMETRY_MODE = prevMode
  })

  function getTracer() {
    return trace.getTracer('order-service')
  }

  /**
   * Good adapter: uses protocol context (root span) to keep all
   * handler spans in the same trace.
   */
  function makeGoodAdapter() {
    const protocol: Protocol<OtelContext> = {
      name: 'correlation-test',
      async setup() {
        const rootSpan = getTracer().startSpan('test.transaction')
        return trace.setSpan(context.active(), rootSpan)
      },
      async teardown(ctx) {
        trace.getSpan(ctx)?.end()
      },
      telemetry: collector,
    }

    return implement(orderFlow, {
      protocol,
      actions: {
        checkout: async (ctx, { orderId }) => {
          // Pass parent context directly — avoids needing AsyncLocalStorageContextManager
          const span = getTracer().startSpan('order.checkout', {}, ctx)
          span.setAttribute('order.id', orderId)
          span.end()
        },
        fulfillOrder: async (ctx, { orderId }) => {
          const span = getTracer().startSpan('order.fulfill', {}, ctx)
          span.setAttribute('order.id', orderId)
          span.end()
        },
        sendConfirmation: async (ctx, { email }) => {
          const span = getTracer().startSpan('notification.send', {}, ctx)
          span.setAttribute('email.recipient', email)
          span.end()
        },
      },
      queries: {},
      assertions: {},
    })
  }

  describe('attribute correlation (febd1d9d)', () => {
    it('correlated steps sharing attribute value pass', async () => {
      const adapter = makeGoodAdapter()
      await runTestWithAdapter(adapter, orderFlow, 'correlation-pass', async ({ act }) => {
        await act.checkout({ orderId: '123' })
        await act.fulfillOrder({ orderId: '123' })
      })
    })

    it('independent steps with different values skip correlation check', async () => {
      const adapter = makeGoodAdapter()
      await runTestWithAdapter(adapter, orderFlow, 'independent-values', async ({ act }) => {
        await act.checkout({ orderId: '123' })
        await act.checkout({ orderId: '456' })
      })
    })

    it('attribute missing on correlated span fails (caught by per-step verification)', async () => {
      // Per-step verification catches missing attributes before correlation runs.
      // This demonstrates the first layer of defense.
      const protocol: Protocol<OtelContext> = {
        name: 'correlation-broken-attr',
        async setup() {
          const rootSpan = getTracer().startSpan('test.transaction')
          return trace.setSpan(context.active(), rootSpan)
        },
        async teardown(ctx) { trace.getSpan(ctx)?.end() },
        telemetry: collector,
      }

      const adapter = implement(orderFlow, {
        protocol,
        actions: {
          checkout: async (ctx, { orderId }) => {
            const span = getTracer().startSpan('order.checkout', {}, ctx)
            span.setAttribute('order.id', orderId)
            span.end()
          },
          fulfillOrder: async (ctx, _p) => {
            // BUG: emits span but forgets order.id attribute
            const span = getTracer().startSpan('order.fulfill', {}, ctx)
            span.end()
          },
          sendConfirmation: async () => {},
        },
        queries: {},
        assertions: {},
      })

      await expect(
        runTestWithAdapter(adapter, orderFlow, 'attr-mismatch', async ({ act }) => {
          await act.checkout({ orderId: '123' })
          await act.fulfillOrder({ orderId: '123' })
        })
      ).rejects.toThrow(/Telemetry mismatch/)
    })

    it('steps with no shared attribute keys skip correlation', async () => {
      const adapter = makeGoodAdapter()
      await runTestWithAdapter(adapter, orderFlow, 'no-overlap', async ({ act }) => {
        await act.checkout({ orderId: '123' })
        await act.sendConfirmation({ email: 'user@example.com' })
      })
    })
  })

  describe('causal correlation (7e6a51b7)', () => {
    it('correlated steps in same trace pass causal check', async () => {
      const adapter = makeGoodAdapter()
      await runTestWithAdapter(adapter, orderFlow, 'causal-pass', async ({ act }) => {
        await act.checkout({ orderId: '123' })
        await act.fulfillOrder({ orderId: '123' })
      })
    })

    it('correlated steps in different traces with link pass', async () => {
      // Adapter explicitly creates a span link across trace boundary
      let checkoutSpanContext: any

      const protocol: Protocol<void> = {
        name: 'correlation-linked',
        async setup() {},
        async teardown() {},
        telemetry: collector,
      }

      const adapter = implement(orderFlow, {
        protocol,
        actions: {
          checkout: async (_ctx, { orderId }) => {
            await getTracer().startActiveSpan('order.checkout', async (span) => {
              span.setAttribute('order.id', orderId)
              checkoutSpanContext = span.spanContext()
              span.end()
            })
          },
          fulfillOrder: async (_ctx, { orderId }) => {
            // New root context (different trace) but with link to checkout
            await context.with(trace.deleteSpan(context.active()), async () => {
              await getTracer().startActiveSpan('order.fulfill', {
                links: [{ context: checkoutSpanContext }],
              }, async (span) => {
                span.setAttribute('order.id', orderId)
                span.end()
              })
            })
          },
          sendConfirmation: async () => {},
        },
        queries: {},
        assertions: {},
      })

      await runTestWithAdapter(adapter, orderFlow, 'linked-traces', async ({ act }) => {
        await act.checkout({ orderId: '123' })
        await act.fulfillOrder({ orderId: '123' })
      })
    })

    it('correlated steps in different traces without link fail', async () => {
      const protocol: Protocol<void> = {
        name: 'correlation-broken-causal',
        async setup() {},
        async teardown() {},
        telemetry: collector,
      }

      const adapter = implement(orderFlow, {
        protocol,
        actions: {
          checkout: async (_ctx, { orderId }) => {
            await getTracer().startActiveSpan('order.checkout', async (span) => {
              span.setAttribute('order.id', orderId)
              span.end()
            })
          },
          fulfillOrder: async (_ctx, { orderId }) => {
            // Different trace, no link — causal break
            await context.with(trace.deleteSpan(context.active()), async () => {
              await getTracer().startActiveSpan('order.fulfill', async (span) => {
                span.setAttribute('order.id', orderId)
                span.end()
              })
            })
          },
          sendConfirmation: async () => {},
        },
        queries: {},
        assertions: {},
      })

      await expect(
        runTestWithAdapter(adapter, orderFlow, 'causal-break', async ({ act }) => {
          await act.checkout({ orderId: '123' })
          await act.fulfillOrder({ orderId: '123' })
        })
      ).rejects.toThrow(/different traces/)
    })

    it('uncorrelated steps skip causal check entirely', async () => {
      // Different attribute keys — no correlation group, no causal check
      // Even though they're in different traces
      const protocol: Protocol<void> = {
        name: 'correlation-uncorrelated',
        async setup() {},
        async teardown() {},
        telemetry: collector,
      }

      const adapter = implement(orderFlow, {
        protocol,
        actions: {
          checkout: async (_ctx, { orderId }) => {
            await getTracer().startActiveSpan('order.checkout', async (span) => {
              span.setAttribute('order.id', orderId)
              span.end()
            })
          },
          fulfillOrder: async () => {},
          sendConfirmation: async (_ctx, { email }) => {
            await context.with(trace.deleteSpan(context.active()), async () => {
              await getTracer().startActiveSpan('notification.send', async (span) => {
                span.setAttribute('email.recipient', email)
                span.end()
              })
            })
          },
        },
        queries: {},
        assertions: {},
      })

      await runTestWithAdapter(adapter, orderFlow, 'uncorrelated-skip', async ({ act }) => {
        await act.checkout({ orderId: '123' })
        await act.sendConfirmation({ email: 'user@example.com' })
      })
    })
  })
})
