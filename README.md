# Aver

[![CI](https://github.com/njackson/aver/actions/workflows/ci.yml/badge.svg)](https://github.com/njackson/aver/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@aver/core)](https://www.npmjs.com/package/@aver/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Domain-driven acceptance testing for TypeScript. Define behavior once, verify it everywhere.

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

Same test. Three adapters. Zero code duplication.

## Quick Start

```bash
npm install --save-dev @aver/core vitest
npx aver init --domain TaskBoard --protocol unit
npx aver run
```

## How it works

**Domains** declare vocabulary — actions, queries, and assertions in business language. **Adapters** bind that vocabulary to real systems (in-memory, HTTP, browser). **Tests** speak only domain language and run against any adapter.

```
Domain (what)  →  Adapter (how)  →  Test (verify)
```

The domain is the stable center. Tests compose domain operations into scenarios. Adapters are interchangeable. Five domain operations support fifty tests — vocabulary grows slowly, scenarios grow fast.

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
| [`@aver/protocol-http`](packages/protocol-http) | HTTP protocol adapter |
| [`@aver/protocol-playwright`](packages/protocol-playwright) | Playwright browser protocol adapter |
| [`@aver/agent-plugin`](packages/agent-plugin) | Claude Code plugin — MCP + workflow/telemetry skills |

## License

[MIT](LICENSE)
