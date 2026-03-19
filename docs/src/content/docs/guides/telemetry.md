---
title: "Telemetry"
---

> **Experimental.** Telemetry verification is functional and tested but has not been validated in production environments. The correlation model, `causes` API, and contract verification workflow may evolve based on real-world usage. If you're using this in practice, we'd love to hear about your experience — [open an issue](https://github.com/averspec/aver/issues) or [start a discussion](https://github.com/averspec/aver/discussions).

Aver can verify that your system emits the right OTel spans — not just that it produces the right output, but that it's observable. More importantly, it verifies that the *relationships* between spans are intact: operations that belong to the same business flow share a trace, carry correlated attributes, and remain causally connected. When those relational seams break, your dashboards and AI agents lose the context that makes observability data powerful.

This guide shows how to add telemetry declarations to a domain and set up verification. For a hands-on walkthrough with failure examples, see the [Telemetry Tutorial](/tutorial-telemetry/).

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
import { createOtlpReceiver } from '@averspec/telemetry'

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

Steps that share an attribute key and are called with the same value are **correlated**. The framework verifies two things:

1. **Attribute correlation** (automatic) — each step's span carries the declared attributes with the correct value
2. **Causal correlation** (opt-in via `causes`) — spans are in the same trace or connected via span links

### Attribute correlation

Use the same attribute key across related operations:

```typescript
checkout: action<{ orderId: string }>({
  telemetry: (p) => ({ span: 'order.checkout', attributes: { 'order.id': p.orderId } })
}),
fulfillOrder: action<{ orderId: string }>({
  telemetry: (p) => ({ span: 'order.fulfill', attributes: { 'order.id': p.orderId } })
}),
```

When a test calls `checkout({ orderId: '123' })` then `fulfillOrder({ orderId: '123' })`, the framework checks that both spans carry `order.id: '123'`. This works across independent HTTP requests, separate services, or any boundary — the check is purely about attribute values.

### Causal correlation with `causes`

When an operation triggers another operation asynchronously (e.g., via a message queue or background worker), you can declare the causal relationship:

```typescript
assignTask: action<{ title: string; assignee: string }>({
  telemetry: (p) => ({
    span: 'task.assign',
    attributes: { 'task.title': p.title },
    causes: ['notification.process'],
  }),
}),
```

The `causes` declaration tells the verifier: "when `task.assign` runs, it should produce a `notification.process` span that is causally connected — either in the same trace or linked via a span link." If the spans are in different traces with no link, the verifier flags it.

This creates design pressure to propagate trace context across async boundaries. When the check fails, the error message tells you what to do:

```
'task.assign' declares causes: ['notification.process'] but spans are in
different traces with no link. Propagate trace context or add a span link
at the async boundary.
```

Use `causes` when your code explicitly triggers the downstream operation (queues, event buses, async workers). Don't use it for operations that happen to share an entity but are triggered independently (separate user actions, unrelated API calls).

## Telemetry mode

Controlled by `AVER_TELEMETRY_MODE`:

| Mode | Behavior | Default when |
|------|----------|-------------|
| `fail` | Mismatch throws | CI (`process.env.CI` is set) |
| `warn` | Mismatch recorded in trace, test passes | Local development |
| `off` | No telemetry verification | When explicitly disabled |

## How verification works in practice

### Spans must arrive before verification runs

Aver verifies telemetry immediately after each adapter handler returns. If your application emits spans asynchronously (e.g., via a background worker or batched exporter), they need to be flushed to the collector before the handler returns. Otherwise verification reports "span not found."

In your HTTP adapter, call `flushTracing()` (or equivalent) after operations that emit spans:

```typescript
actions: {
  async createTask(ctx, payload) {
    const res = await ctx.post('/api/tasks', payload)
    await flushTracing() // Ensure spans reach the OTLP receiver
    return res.json()
  },
}
```

For async operations like queued workers, drain the queue before flushing:

```typescript
async assignTask(ctx, payload) {
  await ctx.patch(`/api/tasks/${payload.title}`, { assignee: payload.assignee })
  await drainQueue()    // Wait for background worker to finish
  await flushTracing()  // Then flush all spans
}
```

### Local vs CI mode defaults

Telemetry mode defaults to `warn` locally and `fail` in CI (when `process.env.CI` is set). This means telemetry mismatches log a warning locally but fail the test in CI. To get consistent behavior, set `AVER_TELEMETRY_MODE=fail` locally when working on telemetry declarations.

### What gets verified and what doesn't

- **Unit adapters** don't provide a `TelemetryCollector`, so telemetry verification is skipped. This is by design — unit tests run in-process without real OTel spans. To verify telemetry, use an adapter with a collector (like an HTTP adapter with an OTLP receiver).
- **Operations without `telemetry:` declarations** are not verified — no warning, no error. Not every operation needs tracing, but you won't get feedback about missing declarations unless you add them.

## Span naming conventions

Follow OTel semantic conventions: `{noun}.{verb}` or `{service}.{operation}`.

- `order.checkout`, `order.fulfill`, `notification.send`
- NOT `doCheckout`, `handleFulfillment`

## Dev-to-production verification

Test-time telemetry verification proves your system emits the right spans in a controlled environment. But does production actually emit the same spans with the same attributes? Code paths differ, middleware interferes, instrumentation gets refactored away. The `@averspec/telemetry` package closes this gap with two functions: `extractContract()` and `verifyContract()`.

### The flow

1. Run your tests. Each passing test produces a trace of domain operations with telemetry expectations.
2. `extractContract()` distills those traces into a **behavioral contract** -- a portable description of what spans production must emit.
3. Collect OTLP traces from production (or staging).
4. `verifyContract()` checks the contract against those real traces and reports violations.

### Extracting a contract

`extractContract()` takes a domain and an array of test results (test name + trace entries from passing tests). It walks each trace, finds operations with telemetry declarations, and produces span expectations with attribute bindings.

```typescript
import { extractContract } from '@averspec/telemetry'
import { signupFlow } from './domains/signup-flow'

const contract = extractContract({
  domain: signupFlow,
  results: [
    {
      testName: 'signup creates account',
      trace: [
        // TraceEntry objects from a passing test run
        // (the framework records these automatically)
      ],
    },
  ],
})
```

The contract captures two kinds of attribute bindings:

- **Literal** -- fixed values from static telemetry declarations. If your domain says `telemetry: { span: 'order.cancel', attributes: { 'order.status': 'cancelled' } }`, the contract records `{ kind: 'literal', value: 'cancelled' }`. Production must emit that exact value.
- **Correlated** -- parameterized values discovered via proxy-based field tracking. If your domain says `telemetry: (p) => ({ span: 'user.signup', attributes: { 'user.email': p.email } })`, the contract records `{ kind: 'correlated', symbol: '$email' }`. Production doesn't need to match the test's specific email -- but every span referencing `$email` within a single trace must carry the *same* value.

This distinction matters: literal bindings catch "the span emits the wrong constant," while correlated bindings catch "the signup span and the account-created span reference different users."

### Verifying against production traces

`verifyContract()` takes a contract and an array of production traces. Each trace has a `traceId` and an array of spans (name + attributes).

```typescript
import { verifyContract } from '@averspec/telemetry'
import type { ProductionTrace } from '@averspec/telemetry'

// Collect these from your OTLP backend, staging environment, or trace pipeline
const productionTraces: ProductionTrace[] = [
  {
    traceId: 'abc123',
    spans: [
      { name: 'user.signup', attributes: { 'user.email': 'jane@example.com' } },
      { name: 'account.created', attributes: { 'account.email': 'jane@example.com' } },
    ],
  },
  {
    traceId: 'def456',
    spans: [
      { name: 'user.signup', attributes: { 'user.email': 'bob@example.com' } },
      // account.created span missing -- instrumentation gap
    ],
  },
]

const report = verifyContract(contract, productionTraces)
```

For each contract entry, the verifier finds production traces containing the entry's first span (the "anchor"). It then checks all subsequent spans for presence, literal attribute matches, and correlation consistency.

### Reading the conformance report

The `ConformanceReport` contains:

- `domain` -- the domain name
- `results` -- one `EntryVerificationResult` per contract entry, each with:
  - `testName` -- which test scenario this entry came from
  - `tracesMatched` -- how many production traces contained the anchor span
  - `tracesChecked` -- total traces examined
  - `violations` -- the specific failures found
- `totalViolations` -- sum across all entries

Three violation types:

**`missing-span`** -- a span the contract expects was not found in a matching trace.

```
{ kind: 'missing-span', spanName: 'account.created', traceId: 'def456' }
```

This means trace `def456` had the anchor span (`user.signup`) but was missing `account.created`. An instrumentation gap or a code path that skips account creation.

**`literal-mismatch`** -- a span attribute has a different value than the contract requires.

```
{ kind: 'literal-mismatch', span: 'order.cancel', attribute: 'order.status',
  expected: 'cancelled', actual: 'pending', traceId: 'trace-1' }
```

Production emitted the span but with the wrong attribute value. The domain says cancellation sets status to `'cancelled'`; production says `'pending'`.

**`correlation-violation`** -- two spans that should reference the same entity carry different values.

```
{ kind: 'correlation-violation', symbol: '$email',
  paths: [
    { span: 'user.signup', attribute: 'user.email', value: 'jane@co.com' },
    { span: 'account.created', attribute: 'account.email', value: 'other@co.com' },
  ],
  traceId: 'trace-bad' }
```

Within a single trace, the signup and account-creation spans reference different email addresses. The data is inconsistent -- either a bug in propagation or a race condition.

### Worked example

Putting it all together for a signup flow domain:

```typescript
import { defineDomain, action, assertion } from '@averspec/core'
import { extractContract, verifyContract } from '@averspec/telemetry'
import type { ProductionTrace } from '@averspec/telemetry'

// 1. Domain with telemetry declarations
const signupFlow = defineDomain({
  name: 'signup-flow',
  actions: {
    signUp: action<{ email: string }>({
      telemetry: (p) => ({
        span: 'user.signup',
        attributes: { 'user.email': p.email },
      }),
    }),
  },
  queries: {},
  assertions: {
    accountCreated: assertion<{ email: string }>({
      telemetry: (p) => ({
        span: 'account.created',
        attributes: { 'account.email': p.email },
      }),
    }),
  },
})

// 2. Extract contract from test results (after running tests)
const contract = extractContract({
  domain: signupFlow,
  results: testResults, // from your test runner
})

// contract.entries[0].spans:
//   [{ name: 'user.signup', attributes: { 'user.email': { kind: 'correlated', symbol: '$email' } } },
//    { name: 'account.created', attributes: { 'account.email': { kind: 'correlated', symbol: '$email' } } }]

// 3. Verify against production traces
const report = verifyContract(contract, productionTraces)

if (report.totalViolations > 0) {
  console.error(`${report.totalViolations} violation(s) found in ${report.domain}`)
  for (const result of report.results) {
    for (const v of result.violations) {
      console.error(`  [${v.kind}] trace ${v.traceId}`)
    }
  }
}
```

Traces that don't contain the anchor span are silently skipped -- unrelated traffic won't generate false positives. Only traces that *look like* the scenario under test are checked.

## Exporting traces from Jaeger

If you're using Jaeger as your tracing backend, you can export traces for use with `FileTraceSource`:

1. Query the Jaeger HTTP API: `GET http://<jaeger-host>:16686/api/traces?service=<your-service>&limit=100`
2. Save the JSON response to a file: `curl -s 'http://localhost:16686/api/traces?service=my-app&limit=100' -o traces.json`
3. Pass the file to `FileTraceSource` and use it with `verifyContract()`

This is the fastest way to get production traces into the verification pipeline without building a custom collector integration.

## Design considerations

Telemetry declarations can live on domain markers or on adapters. Both placements are valid, and the right choice depends on your team's intent:

- **Domain markers** — use this when observability is a business requirement. If the business says "checkout must be traceable" or "every payment must emit an audit span," then telemetry is part of the domain contract. Declaring it on the marker makes it visible to anyone reading the domain and ensures every adapter satisfies the requirement.
- **Adapters** — use this when telemetry is an implementation detail. If only the HTTP adapter needs spans (for debugging or performance monitoring) but the unit adapter doesn't care, putting telemetry on the adapter keeps the domain clean and avoids forcing every adapter to satisfy span expectations.

There is no universally correct answer. Some teams start with adapter-level telemetry and promote declarations to the domain when they realize observability is load-bearing. Others start at the domain level and move declarations down when they find the constraints too rigid for some adapters. Either direction works — the key is being intentional about whether a span is a business promise or an engineering convenience.
