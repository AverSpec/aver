# @averspec/telemetry

> **Status: Early release.** API is stabilizing. Breaking changes will be noted in release notes.

Behavioral contract export and production trace verification for Aver.

Verify that your system emits the right OpenTelemetry spans — not just in tests, but in production. Extract expected telemetry from test runs, then check real production traces against that contract to catch instrumentation gaps, broken correlations, and attribute mismatches.

## Installation

```bash
npm install @averspec/telemetry @averspec/core vitest
```

Requires `@averspec/core` and `vitest` as peer dependencies. Node.js 22+.

## Quick Start

### Extract Contract from Tests

After running tests with telemetry declarations, extract a portable behavioral contract:

```typescript
import { extractContract } from '@averspec/telemetry'

const contract = extractContract({
  domain: signupFlow,
  results: [
    {
      testName: 'signup creates account',
      trace: testTraceEntries, // TraceEntry[] from passing test
    },
  ],
})
```

### Verify Production Traces

Check real OTLP traces against the contract:

```typescript
import { verifyContract } from '@averspec/telemetry'
import type { ProductionTrace } from '@averspec/telemetry'

const report = verifyContract(contract, productionTraces)

if (report.totalViolations > 0) {
  console.error(`${report.totalViolations} violations found`)
}
```

Violations detected: `missing-span`, `literal-mismatch`, `correlation-violation`.

### Set Up OTLP Receiver

For integration testing, spin up a local OTLP collector:

```typescript
import { createOtlpReceiver } from '@averspec/telemetry'

const receiver = createOtlpReceiver()
const port = await receiver.start()
// Configure app to export spans to http://localhost:${port}/v1/traces

const protocol = { telemetry: receiver }
```

## Documentation

- **[Telemetry Guide](../../docs/guides/telemetry.md)** — Adding telemetry to domains, correlation design
- **[Telemetry Tutorial](../../docs/tutorial-telemetry.md)** — Hands-on examples and failure scenarios

## License

[MIT](../../LICENSE)
