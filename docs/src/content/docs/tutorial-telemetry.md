---
title: "Tutorial: Telemetry Verification"
---

Your API returns the right data. Your tests pass. Then production goes dark — a span is missing, a trace is disconnected, and the relationships between operations are silently destroyed. Nobody noticed because no test checked observability.

Observability data is made powerful by context. A checkout span alone tells you little. A checkout span connected to a payment span connected to a fulfillment span — all sharing an order ID, all in the same trace — tells you the whole story. When those connections break, your dashboards go dark and your agents can't validate what they shipped.

This tutorial shows how Aver treats those relationships as a testable contract. You will:
1. Add telemetry declarations to a domain
2. Watch a test fail because spans are missing
3. Fix the instrumentation so tests pass
4. See Aver automatically detect broken trace correlation — the relational seams between operations

This builds on the pricing domain from the [main tutorial](/tutorial/). If you have not done that tutorial, skim Step 2 (domain) and Step 4 (unit adapter) first.

---

## The problem

Consider a pricing service instrumented with OpenTelemetry. The `addLineItem` handler creates a span, and the `invoiceTotal` query creates another. Both work in production — until someone refactors the query handler and forgets to re-add the span. Or renames the span. Or drops an attribute that downstream dashboards depend on.

Behavioral tests will not catch this. The API still returns the right numbers. The bug is silent until someone checks a dashboard days later.

Aver treats telemetry as a testable contract. You declare what spans each operation should emit, and the framework verifies them alongside behavior.

---

## Step 1: Add telemetry declarations

Start with the pricing domain from the main tutorial. Add `telemetry` to the markers that represent observable operations:

```typescript
// domains/pricing.ts
import { defineDomain, action, query, assertion } from '@averspec/core'

export const pricing = defineDomain({
  name: 'pricing',
  actions: {
    addLineItem: action<{ product: string; quantity: number; unitPrice: number }>({
      telemetry: (p) => ({
        span: 'pricing.add-line-item',
        attributes: { 'product.name': p.product },
      }),
    }),
  },
  queries: {
    invoiceTotal: query<number>({
      telemetry: { span: 'pricing.invoice-total' },
    }),
    appliedDiscount: query<number>(),
  },
  assertions: {
    totalEquals: assertion<{ expected: number }>(),
    discountApplied: assertion<{ percent: number }>(),
    noDiscount: assertion(),
  },
})
```

Two forms are shown here:

- **Parameterized** on `addLineItem` — the telemetry declaration is a function that receives the action's payload. Use this when attributes come from parameters (product names, order IDs, amounts).
- **Static** on `invoiceTotal` — fixed span name, no attributes. Use this when you just need to verify the span exists.

Not every marker needs a telemetry declaration. `appliedDiscount`, `totalEquals`, and the other assertions have no `telemetry` property — they are internal operations that do not need to be observable. Only declare telemetry for operations where missing spans would matter in production.

---

## Step 2: Set up a collector

The framework needs access to the spans your code emits. You provide this through a `telemetry` property on the adapter's protocol.

For in-process testing, use the OTel SDK's `InMemorySpanExporter`:

```typescript
// adapters/pricing.unit.ts
import { adapt, unit } from '@averspec/core'
import { expect } from 'vitest'
import { pricing } from '../domains/pricing.js'
import {
  InMemorySpanExporter,
  BasicTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base'
import type { Protocol, TelemetryCollector, CollectedSpan } from '@averspec/core'

// --- OTel collector wiring ---

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
        parentSpanId: parentCtx && parentCtx.spanId !== '0000000000000000'
          ? parentCtx.spanId : undefined,
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

// --- Context and adapter ---

interface PricingContext {
  items: Array<{ product: string; quantity: number; unitPrice: number }>
}

function calculate(ctx: PricingContext) {
  const subtotal = ctx.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const totalQty = ctx.items.reduce((s, i) => s + i.quantity, 0)
  const discountPct = totalQty >= 50 ? 20 : totalQty >= 10 ? 10 : 0
  const afterDiscount = subtotal * (1 - discountPct / 100)
  return { subtotal, discountPct, total: afterDiscount * 1.08 }
}

const protocol: Protocol<PricingContext> = {
  name: 'unit',
  async setup() {
    return { items: [] }
  },
  async teardown() {},
  telemetry: collector,
}

export const unitAdapter = adapt(pricing, {
  protocol,
  actions: {
    addLineItem: async (ctx, item) => {
      ctx.items.push(item)
      // No OTel span here yet — this is the bug we are about to catch
    },
  },
  queries: {
    invoiceTotal: async (ctx) => calculate(ctx).total,
    appliedDiscount: async (ctx) => calculate(ctx).discountPct,
  },
  assertions: {
    totalEquals: async (ctx, { expected }) => {
      expect(calculate(ctx).total).toBeCloseTo(expected, 2)
    },
    discountApplied: async (ctx, { percent }) => {
      expect(calculate(ctx).discountPct).toBe(percent)
    },
    noDiscount: async (ctx) => {
      expect(calculate(ctx).discountPct).toBe(0)
    },
  },
})
```

The key piece is the `telemetry` property on the protocol. It implements the `TelemetryCollector` interface — `getSpans()` returns the collected spans, and `reset()` clears them between tests. The framework calls these automatically.

---

## Step 3: See the failure

The tests from the main tutorial still work:

```typescript
// tests/pricing.spec.ts
import { suite } from '@averspec/core'
import { pricing } from '../domains/pricing.js'

const { test } = suite(pricing)

test('basic invoice total', async ({ given, when, then }) => {
  await given.addLineItem({ product: 'Widget', quantity: 2, unitPrice: 10.00 })
  await when.addLineItem({ product: 'Gadget', quantity: 1, unitPrice: 5.00 })
  await then.totalEquals({ expected: 27.00 })
})
```

Run them with telemetry verification enabled:

```bash
AVER_TELEMETRY_MODE=fail npx aver run tests/pricing.spec.ts
```

The behavioral assertion passes — the total is correct. But the test fails:

```
FAIL  tests/pricing.spec.ts > basic invoice total [unit]

Error: Telemetry mismatch: expected span 'pricing.add-line-item' not found

Test steps (unit):
  [FAIL] GIVEN  pricing.addLineItem({"product":"Widget","quantity":2,"unitPrice":10})
           ⚠ telemetry: expected span 'pricing.add-line-item' not found
```

The framework checked for a span named `pricing.add-line-item` after the `addLineItem` action ran. No span was found because the adapter does not create one. The behavioral test passed, but the observability contract is broken.

This is the gap. Without telemetry verification, this test would pass green while production dashboards go dark.

---

## Step 4: Fix the instrumentation

Add OTel spans to the adapter implementation:

```typescript
import { trace } from '@opentelemetry/api'

function getTracer() {
  return trace.getTracer('pricing-service')
}

// Register the provider globally (do this once, e.g., in setup)
trace.setGlobalTracerProvider(provider)

export const unitAdapter = adapt(pricing, {
  protocol,
  actions: {
    addLineItem: async (ctx, item) => {
      const span = getTracer().startSpan('pricing.add-line-item')
      span.setAttribute('product.name', item.product)
      ctx.items.push(item)
      span.end()
    },
  },
  queries: {
    invoiceTotal: async (ctx) => {
      const span = getTracer().startSpan('pricing.invoice-total')
      const result = calculate(ctx).total
      span.end()
      return result
    },
    appliedDiscount: async (ctx) => calculate(ctx).discountPct,
  },
  // assertions unchanged...
})
```

Run again:

```bash
AVER_TELEMETRY_MODE=fail npx aver run tests/pricing.spec.ts
```

```
PASS  tests/pricing.spec.ts > basic invoice total [unit]

Test steps (unit):
  [PASS] GIVEN  pricing.addLineItem({"product":"Widget","quantity":2,"unitPrice":10})
           ✓ telemetry: pricing.add-line-item {"product.name":"Widget"}
  [PASS] WHEN   pricing.addLineItem({"product":"Gadget","quantity":1,"unitPrice":5})
           ✓ telemetry: pricing.add-line-item {"product.name":"Gadget"}
  [PASS] THEN   pricing.totalEquals({"expected":27})
```

Each step now shows its telemetry verification result. The span name and attributes match the declaration.

Notice that the parameterized declaration on `addLineItem` verified different attribute values for each call — `Widget` for the first, `Gadget` for the second. The function receives the actual payload each time.

---

## Step 5: Correlation

Telemetry is not just individual spans. Operations that belong to the same business flow should be causally connected — sharing a trace or linked across traces. Aver verifies this automatically.

Extend the pricing domain with an order-level flow:

```typescript
const orderPricing = defineDomain({
  name: 'order-pricing',
  actions: {
    addLineItem: action<{ orderId: string; product: string; quantity: number; unitPrice: number }>({
      telemetry: (p) => ({
        span: 'pricing.add-line-item',
        attributes: { 'order.id': p.orderId, 'product.name': p.product },
      }),
    }),
    checkout: action<{ orderId: string }>({
      telemetry: (p) => ({
        span: 'order.checkout',
        attributes: { 'order.id': p.orderId },
      }),
    }),
  },
  queries: {},
  assertions: {},
})
```

Both `addLineItem` and `checkout` declare `'order.id'` as an attribute. When a test calls both with the same `orderId`, Aver detects they are **correlated** — they share an attribute key with the same value.

After all steps run, the framework automatically checks:

1. **Attribute correlation** — each matched span carries the declared `order.id` value
2. **Causal correlation** — the spans share a `traceId` (same trace) or are connected via span links

Write a test:

```typescript
test('checkout prices order correctly', async ({ when }) => {
  await when.addLineItem({ orderId: 'ORD-1', product: 'Widget', quantity: 5, unitPrice: 10 })
  await when.checkout({ orderId: 'ORD-1' })
})
```

If the adapter creates each span in a separate trace with no links, the test fails:

```
Error: Telemetry correlation failed:
Steps addLineItem, checkout share 'order.id: ORD-1' but spans are in
different traces (abc123..., def456...) with no link
```

This catches a real production problem: two operations that should be part of the same trace are disconnected. Downstream tracing tools will not be able to link them.

### Fixing the causal break

The fix is to ensure spans share a parent context. In the adapter, create a root span during setup and use it as the parent for all operation spans:

```typescript
import { context, trace } from '@opentelemetry/api'
import type { Context as OtelContext } from '@opentelemetry/api'

const protocol: Protocol<OtelContext> = {
  name: 'unit',
  async setup() {
    const rootSpan = getTracer().startSpan('test.transaction')
    return trace.setSpan(context.active(), rootSpan)
  },
  async teardown(ctx) {
    trace.getSpan(ctx)?.end()
  },
  telemetry: collector,
}

export const unitAdapter = adapt(orderPricing, {
  protocol,
  actions: {
    addLineItem: async (ctx, { orderId, product, quantity, unitPrice }) => {
      // Pass ctx as parent — keeps all spans in the same trace
      const span = getTracer().startSpan('pricing.add-line-item', {}, ctx)
      span.setAttribute('order.id', orderId)
      span.setAttribute('product.name', product)
      span.end()
    },
    checkout: async (ctx, { orderId }) => {
      const span = getTracer().startSpan('order.checkout', {}, ctx)
      span.setAttribute('order.id', orderId)
      span.end()
    },
  },
  queries: {},
  assertions: {},
})
```

Now both spans share the root span's `traceId`. Correlation passes.

For cross-process scenarios where traces genuinely differ (e.g., an async consumer processing a message), you can use **span links** instead of a shared parent. The framework accepts either form as valid causal connection.

---

## Step 6: Telemetry mode

Not every run needs strict telemetry enforcement. Aver provides three modes via the `AVER_TELEMETRY_MODE` environment variable:

| Mode   | Behavior                                | When to use                                  |
|--------|-----------------------------------------|----------------------------------------------|
| `fail` | Missing or mismatched spans fail the test | CI pipelines, pre-merge checks              |
| `warn` | Mismatches are recorded but tests pass   | Local development, exploratory work          |
| `off`  | No telemetry verification at all         | When working on unrelated code               |

**Defaults:** If `AVER_TELEMETRY_MODE` is not set, the framework uses `fail` when `process.env.CI` is defined and `warn` otherwise. This means telemetry verification is strict in CI and lenient locally without any configuration.

Usage:

```bash
# Strict — CI or when working on telemetry
AVER_TELEMETRY_MODE=fail npx aver run tests/pricing.spec.ts

# Lenient — local development
AVER_TELEMETRY_MODE=warn npx aver run tests/pricing.spec.ts

# Disabled — no telemetry checking
AVER_TELEMETRY_MODE=off npx aver run tests/pricing.spec.ts
```

In `warn` mode, the trace output still shows whether spans matched or not — you get the diagnostic information without blocking your workflow.

---

## What you built

```
domains/pricing.ts           # Domain with telemetry declarations
adapters/pricing.unit.ts     # Adapter with OTel spans + collector
tests/pricing.spec.ts        # Same tests — telemetry is verified automatically
```

No new test assertions. No telemetry-specific test code. The declarations live on the domain markers, the collector lives on the protocol, and the framework handles verification. When someone removes a span or renames an attribute, the test fails — before it reaches production.

## Key takeaways

- **Telemetry declarations go on domain markers**, not in tests. The domain defines the observability contract.
- **Two verification layers**: per-step (span exists with expected attributes) and end-of-test (correlated spans are causally connected).
- **Correlation is automatic**: steps sharing an attribute key with the same value are grouped. No explicit correlation API.
- **The adapter determines fidelity**: a unit adapter with `InMemorySpanExporter` verifies in-process spans. An integration adapter with `createOtlpReceiver()` verifies cross-process spans over OTLP. The domain and tests do not change.

## Next steps

- [Telemetry reference](/guides/telemetry/) — collector setup, correlation design, span naming conventions
- [Multi-Adapter Testing](/guides/multi-adapter/) — run the same domain against unit, HTTP, and browser adapters
- [Architecture](/architecture/) — the three-layer model and how telemetry fits in
