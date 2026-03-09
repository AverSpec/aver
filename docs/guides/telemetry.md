---
layout: default
title: Telemetry
parent: Guides
nav_order: 5
---

# Adding Telemetry to a Domain

Aver can verify that your system emits the right OTel spans — not just that it produces the right output, but that it's observable. More importantly, it verifies that the *relationships* between spans are intact: operations that belong to the same business flow share a trace, carry correlated attributes, and remain causally connected. When those relational seams break, your dashboards and AI agents lose the context that makes observability data powerful.

This guide shows how to add telemetry declarations to a domain and set up verification. For a hands-on walkthrough with failure examples, see the [Telemetry Tutorial](telemetry-tutorial).

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

## Dev-to-production verification

Test-time telemetry verification proves your system emits the right spans in a controlled environment. But does production actually emit the same spans with the same attributes? Code paths differ, middleware interferes, instrumentation gets refactored away. The `@aver/telemetry` package closes this gap with two functions: `extractContract()` and `verifyContract()`.

### The flow

1. Run your tests. Each passing test produces a trace of domain operations with telemetry expectations.
2. `extractContract()` distills those traces into a **behavioral contract** -- a portable description of what spans production must emit.
3. Collect OTLP traces from production (or staging).
4. `verifyContract()` checks the contract against those real traces and reports violations.

### Extracting a contract

`extractContract()` takes a domain and an array of test results (test name + trace entries from passing tests). It walks each trace, finds operations with telemetry declarations, and produces span expectations with attribute bindings.

```typescript
import { extractContract } from '@aver/telemetry'
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
import { verifyContract } from '@aver/telemetry'
import type { ProductionTrace } from '@aver/telemetry'

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
import { defineDomain, action, assertion } from '@aver/core'
import { extractContract, verifyContract } from '@aver/telemetry'
import type { ProductionTrace } from '@aver/telemetry'

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
