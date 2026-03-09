---
layout: default
title: Telemetry
parent: Guides
nav_order: 4
---

# Adding Telemetry to a Domain

Aver can verify that your system emits the right OTel spans — not just that it produces the right output, but that it's observable. This guide shows how to add telemetry declarations to a domain and set up verification.

## When to add telemetry

Not every domain needs telemetry declarations. Add them when:

- **Business-critical flows** — payment, order, auth — where missing observability is a production risk
- **Cross-boundary operations** — HTTP calls, queues, external services — where trace propagation matters
- **Compliance requirements** — audit trails that must be proven observable

Skip telemetry for internal plumbing, admin CRUD, and dev tooling.

## Declaring expected spans

Telemetry declarations go on action, query, or assertion markers. Two forms:

**Static** — when the span name and attributes are fixed:

```typescript
checkout: action({
  telemetry: { span: 'order.checkout', attributes: { 'order.type': 'standard' } }
})
```

**Parameterized** — when attributes come from the operation's payload:

```typescript
checkout: action<{ orderId: string }>({
  telemetry: (p) => ({
    span: 'order.checkout',
    attributes: { 'order.id': p.orderId }
  })
})
```

Use parameterized declarations for high-cardinality values (IDs, emails, amounts). Use static for fixed values.

## Setting up a collector

The adapter's protocol needs a `TelemetryCollector` so the framework can verify spans.

**In-process (unit adapter):**

```typescript
import { InMemorySpanExporter, BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'

const exporter = new InMemorySpanExporter()
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
})

const protocol: Protocol<MyContext> = {
  name: 'unit',
  async setup() { /* ... */ },
  async teardown() { /* ... */ },
  telemetry: {
    getSpans() {
      return exporter.getFinishedSpans().map(s => ({
        traceId: s.spanContext().traceId,
        spanId: s.spanContext().spanId,
        name: s.name,
        attributes: { ...s.attributes },
        links: s.links.map(l => ({ traceId: l.context.traceId, spanId: l.context.spanId })),
      }))
    },
    reset() { exporter.reset() },
  },
}
```

**Cross-process (integration adapter):**

```typescript
import { createOtlpReceiver } from '@aver/core'

const receiver = createOtlpReceiver()
const port = await receiver.start()
// Configure your app to export spans to http://localhost:${port}/v1/traces

const protocol: Protocol<MyContext> = {
  name: 'integration',
  // ...
  telemetry: receiver,
}
```

## Correlation design

Steps that share an attribute key and are called with the same value are **correlated**. The framework automatically verifies:

1. Each step's span carries the declared attributes (per-step)
2. Correlated steps' spans are causally connected (end-of-test)

Design correlation by using the same attribute key across related operations:

```typescript
checkout: action<{ orderId: string }>({
  telemetry: (p) => ({ span: 'order.checkout', attributes: { 'order.id': p.orderId } })
}),
fulfillOrder: action<{ orderId: string }>({
  telemetry: (p) => ({ span: 'order.fulfill', attributes: { 'order.id': p.orderId } })
}),
```

When a test calls `checkout({ orderId: '123' })` then `fulfillOrder({ orderId: '123' })`, the framework checks that both spans carry `order.id: '123'` and share a traceId (or are linked).

## Telemetry mode

Controlled by `AVER_TELEMETRY_MODE`:

| Mode | Behavior | Default when |
|------|----------|-------------|
| `fail` | Mismatch throws | CI (`process.env.CI` is set) |
| `warn` | Mismatch recorded in trace, test passes | Local development |
| `off` | No telemetry verification | When explicitly disabled |

## Span naming conventions

Follow OTel semantic conventions: `{noun}.{verb}` or `{service}.{operation}`.

- `order.checkout`, `order.fulfill`, `notification.send`
- NOT `doCheckout`, `handleFulfillment`
