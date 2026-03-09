---
name: telemetry
description: Design, implement, and debug telemetry declarations on aver domains — from deciding what to instrument through fixing correlation failures
---

# Telemetry

A lens on the aver workflow for domains that warrant observability. This skill adds telemetry-specific questions and patterns at each phase — it doesn't replace the aver-workflow, it augments it.

Use this skill when:
- Designing a new domain and deciding whether to add telemetry declarations
- Specifying telemetry attributes and correlation expectations
- Implementing an adapter that emits OTel spans
- Debugging a telemetry mismatch or causal-break failure

## During Example Mapping: Should this domain have telemetry?

Not every domain needs telemetry declarations. Ask:

- **Is this a business-critical flow?** (payment, order, auth) → yes, instrument it
- **Does this cross system boundaries?** (HTTP calls, queues, external services) → yes, you'll want to verify propagation
- **Is this internal plumbing?** (admin CRUD, config management, dev tooling) → probably not

If telemetry is warranted, add these questions to the mapping session:

1. **What identifies a transaction?** The high-cardinality attribute that ties steps together. For an order flow: `order.id`. For auth: `session.id`. This becomes the correlation key.
2. **Which steps share that identifier?** These are your correlated steps. Their spans should carry the same attribute value and be causally connected.
3. **Where are the async boundaries?** Steps in the same request share a traceId naturally. Steps across a queue, webhook, or scheduled job are separate traces — they need span links.

Capture these decisions in the scenario's rules. Example:
> "checkout and fulfillOrder share order.id — correlated, same trace. sendConfirmation is triggered by a queue — separate trace, linked."

## During Specification: Declaring telemetry on domain vocabulary

Telemetry declarations go on action, query, and assertion markers. Two forms:

**Static** — when the span name and attributes are fixed:
```typescript
action({ telemetry: { span: 'user.login', attributes: { 'auth.method': 'oauth' } } })
```

**Parameterized** — when attributes come from the operation's payload:
```typescript
action<{ orderId: string }>({
  telemetry: (p) => ({ span: 'order.checkout', attributes: { 'order.id': p.orderId } })
})
```

Use parameterized declarations when the attribute value is high-cardinality (IDs, emails, amounts). Use static when the attribute is fixed (method names, status codes).

### Correlation design

Steps that share an attribute key AND are called with the same value are **correlated**. The framework automatically:
1. Verifies each step's span carries the declared attributes (per-step)
2. Verifies correlated steps' spans are causally connected (end-of-test)

When naming attributes, use the same key across correlated steps. `order.id` on both `checkout` and `fulfillOrder` — not `checkout.order_id` and `fulfillment.order_id`.

### Span naming conventions

Follow the OTel semantic conventions pattern: `{noun}.{verb}` or `{service}.{operation}`.
- `order.checkout`, `order.fulfill`, `notification.send`
- NOT `doCheckout`, `handleFulfillment`, `sendNotificationEmail`

## During Implementation: Adapter OTel setup

The adapter is responsible for emitting spans. The domain declares *what* telemetry to expect; the adapter determines *how* it's produced.

### The outer loop (acceptance test)

The domain's telemetry declarations define the acceptance criteria. The framework's per-step verification (`matchSpan`) and end-of-test correlation check (`verifyCorrelation`) are the assertions. You don't write telemetry assertions manually — the framework handles it.

To enable verification, the protocol needs a `TelemetryCollector`:

**In-process (unit adapter):**
```
// Use InMemorySpanExporter → map to CollectedSpan
// Set protocol.telemetry = collector
```

**Cross-process (integration adapter):**
```
// Use createOtlpReceiver() — lightweight HTTP server
// Receives OTLP exports, exposes CollectedSpan[]
// Set protocol.telemetry = receiver
```

### The inner loop (span emission)

Each adapter handler emits a span matching the domain's declaration:

1. Get a tracer: `trace.getTracer('service-name')`
2. Start a span with the declared name: `tracer.startSpan('order.checkout', {}, parentCtx)`
3. Set the declared attributes: `span.setAttribute('order.id', orderId)`
4. End the span: `span.end()`

The per-step check verifies: does a collected span exist with the expected name and attributes? If not, the test fails with `Telemetry mismatch: expected span 'X' not found`.

### Telemetry mode

Controlled by `AVER_TELEMETRY_MODE` env var:
- `fail` — mismatch throws (default in CI)
- `warn` — mismatch recorded in trace but test passes (default locally)
- `off` — no telemetry verification

## Debugging: Causal-break failures

When the correlation check fails with:
```
Steps checkout, fulfillOrder share 'order.id: 123' but spans are in
different traces (aaa, bbb) with no link
```

This means the steps are correlated (shared attribute) but their spans aren't causally connected.

### Step 1: Is the boundary intentional?

Ask: **are these operations supposed to be in the same trace?**

- **Same request lifecycle** (HTTP handler, single function call) → they should share a traceId. The boundary is accidental — fix it.
- **Intentionally separate** (queue consumer, scheduled job, webhook) → separate traces are correct. A span link is the right relationship.
- **Unclear** → ask the developer. Don't guess.

If the boundary is intentional but the telemetry declaration doesn't reflect it, the test may be wrong. Revisit the scenario — the steps might not be correlated.

### Step 2: Fix based on boundary type

**In-process — lost context:**

Each handler creates a root span independently. Fix: the protocol's `setup()` creates a root span, handlers create children within that context by passing the parent context explicitly to `tracer.startSpan(name, {}, parentCtx)`.

Note: `context.with()` requires `AsyncLocalStorageContextManager`. Without a registered context manager, `context.with()` is a silent noop — this is a common gotcha.

**Cross-process — HTTP/gRPC/RPC:**

Check if an OTel instrumentation package exists for the transport (`@opentelemetry/instrumentation-http`, `-grpc`, `-fetch`). If yes, install it — `traceparent` headers propagate automatically.

If no package exists, identify the request/response seam and add `propagation.inject()` on the sender and `propagation.extract()` on the receiver.

**Cross-process — async (queues, events, jobs):**

Context doesn't teleport. The producer's traceId and spanId must travel with the message. Two paths:

- **Queue has middleware/hooks** (BullMQ, Sidekiq, Celery, Kafka) → check for an OTel instrumentation package. If it exists, context propagation is transparent.
- **No middleware** (pgboss, raw SQS, custom tables) → the enqueue/dequeue boundary is the seam. The producer embeds `traceparent` in the message payload; the consumer extracts it and creates a span link. This changes the message schema — confirm with the developer.

### Step 3: Verify

1. Re-run the failing test
2. Confirm the causal-break violation is gone
3. Check per-step verification still passes

## Boundaries

**In scope:** Designing telemetry declarations, implementing adapter span emission, diagnosing correlation failures, identifying propagation seams.

**Out of scope:** Retrofitting observability into uninstrumented applications, configuring OTel SDK infrastructure (exporters, samplers, collectors), teaching OTel fundamentals.

If the system under test has no instrumentation at all, that's an application concern — name it and hand off to the developer.
