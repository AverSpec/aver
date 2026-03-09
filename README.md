# Know your system works.

[![CI](https://github.com/njackson/aver/actions/workflows/ci.yml/badge.svg)](https://github.com/njackson/aver/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@aver/core)](https://www.npmjs.com/package/@aver/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Domain-driven acceptance testing for TypeScript.**
Describe what your system does. Prove it at every level.

```typescript
const { test } = suite(taskBoard)

test('move task through workflow', async ({ given, when, then }) => {
  await given.createTask({ title: 'Fix login bug' })
  await when.moveTask({ title: 'Fix login bug', status: 'in-progress' })
  await then.taskInStatus({ title: 'Fix login bug', status: 'in-progress' })
})
```

```
 ✓ move task through workflow [unit]          1ms
 ✓ move task through workflow [http]         12ms
 ✓ move task through workflow [playwright]  280ms
```

## The path

**Lock in what exists.** Start with characterization tests that capture your system's current behavior. No domain model needed yet — just prove what's already true.

**Name the behaviors.** Extract a domain vocabulary — actions, queries, assertions in business language. The domain is the stable center; tests speak only domain language.

**Prove it at every level.** Write the test once. Bind it to adapters — in-memory, HTTP, browser. Same scenario, same assertions, different fidelity. OTel verification closes the loop: declare expected telemetry on domain operations, and the framework proves not just that spans exist, but that the relationships between them are intact — same trace, correct attributes, causal connections preserved.

```
Domain (what)  →  Adapter (how)  →  Test (verify)
```

Five domain operations support fifty tests. Vocabulary grows slowly, scenarios grow fast.

## Quick Start

```bash
npm install --save-dev @aver/core vitest
npx aver init --domain TaskBoard --protocol unit
npx aver run
```

## Documentation

- **[Tutorial](docs/tutorial.md)** — From legacy code to multi-adapter tests in 15 minutes
- **[Architecture](docs/architecture.md)** — Three-layer model, design decisions, economics
- **[Getting Started](docs/guides/getting-started.md)** — Install, scaffold, configure
- **[Guides](docs/guides/)** — Multi-adapter, telemetry, CI, AI-assisted testing

## Packages

| Package | Description |
|---------|-------------|
| [`@aver/core`](packages/core) | Domains, adapters, suite, CLI. Zero runtime deps. |
| [`@aver/approvals`](packages/approvals) | Approval testing — structural diffs, visual screenshots |
| [`@aver/telemetry`](packages/telemetry) | Dev-to-prod telemetry verification — contract extraction and conformance checking |
| [`@aver/protocol-http`](packages/protocol-http) | HTTP protocol adapter |
| [`@aver/protocol-playwright`](packages/protocol-playwright) | Playwright browser protocol adapter |
| [`@aver/agent-plugin`](packages/agent-plugin) | Claude Code plugin — MCP + workflow/telemetry skills |

## License

[MIT](LICENSE)
