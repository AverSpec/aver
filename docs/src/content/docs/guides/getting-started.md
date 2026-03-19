---
title: "Getting Started"
---

## Install

```bash
npm install --save-dev @averspec/core vitest
```

Aver uses [Vitest](https://vitest.dev) as its test runner.

## The 30-second version

```bash
npx aver init
npx aver run
```

That scaffolds a domain, a unit adapter, and a test — then runs it. You'll see output like:

```
 ✓ create a task in backlog [unit]
 ✓ move task through workflow [unit]
```

From here, replace the stubs with your real domain. The rest of this page explains the pieces and helps you choose the right starting path.

## Where are you starting from?

Your entry point depends on what you have today.

### I have existing code with no tests

Start by locking in what exists. Install the approvals package and capture current behavior before changing anything:

```bash
npm install --save-dev @averspec/approvals
```

```typescript
import { test } from 'vitest'
import { approve } from '@averspec/approvals'
import { processOrder } from '../src/orders.js'

test('order processing output', async () => {
  const result = processOrder({ items: [{ sku: 'W-100', qty: 3 }] })
  await approve(result)
})
```

Run `AVER_APPROVE=1 npx vitest run` to create baselines, then run normally to verify against them. Baselines are stored in `__approvals__/` next to your test file — commit them to source control. You now have a safety net.

> `approve()` is also exported as `characterize()` if that reads better for your characterization tests.

From here, extract a domain vocabulary as patterns emerge. The [tutorial](/tutorial/) walks through this process end-to-end with a complete example.

### I have existing code with tests I want to restructure

If you already have tests but they're scattered across page objects, test helpers, and ad-hoc abstractions, Aver gives you a spine to consolidate them.

Look at your existing test helpers. They probably already encode domain operations — `createUser()`, `loginAs()`, `verifyOrderStatus()`. Those are your domain vocabulary candidates. Define them as a domain, write adapters that delegate to your existing infrastructure, and your old tests become acceptance tests.

Start with the [tutorial](/tutorial/) to see the pattern, then apply it to your own test helpers.

### I'm building something new

Scaffold a project:

```bash
npx aver init
```

This generates:
- `domains/task-board.ts` — starter domain with actions and assertions
- `adapters/task-board.unit.ts` — unit adapter with handler stubs
- `tests/task-board.spec.ts` — example test
- `aver.config.ts` — adapter registration

Run `npx aver run` to verify the scaffold works, then replace the stubs with your real domain.

For greenfield projects, consider starting with an [Example Mapping](/guides/example-mapping/) session to discover your domain vocabulary before writing code.

## The pieces

Regardless of starting point, every Aver project has four pieces:

```
domains/          # What — vocabulary in business language
adapters/         # How — binds vocabulary to implementations
tests/            # Verify — scenarios using domain language
aver.config.ts    # Wiring — registers adapters
```

**Domain** — declares actions (do something), queries (read something), and assertions (check something). No implementation details. See [API Reference](/api/#domain-definition).

**Adapter** — implements every domain operation for a specific protocol. The `unit` protocol calls your code's public interfaces directly. `http` and `playwright` are separate packages. TypeScript enforces that every domain operation has a handler — miss one and you get a compile error.

**Tests** — import the domain, never the adapter. `suite(domain)` gives you a typed test function. Tests use `given`/`when`/`then` (or `act`/`query`/`assert`) to compose domain operations into scenarios.

**Config** — `defineConfig({ adapters: [...] })` registers adapters. When multiple adapters are registered for the same domain, every test runs against all of them automatically.

## Configure Vitest

Create or update `vitest.config.ts` to load the Aver config:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./aver.config.ts'],
  },
})
```

## When to add what

| When you need... | Add... |
|:-----------------|:-------|
| A safety net for existing code | `@averspec/approvals` — approval testing |
| API-level testing | `@averspec/protocol-http` — HTTP adapter |
| Browser testing | `@averspec/protocol-playwright` — Playwright adapter |
| Telemetry verification | Telemetry declarations on domain markers. See [Telemetry Tutorial](/tutorial-telemetry/) |
| AI-assisted workflow | `@averspec/agent-plugin` — workflow skills + scenario pipeline. See [AI-Assisted](/guides/ai-assisted/) |
| CI integration | No extra packages — `npx aver run` in your pipeline. See [CI Integration](/guides/ci-integration/) |

You don't need everything on day one. Start with `@averspec/core` and a unit adapter. Add packages as your needs grow.

## Next steps

- [Tutorial: Legacy Code](/tutorial/) — from untested code to multi-adapter tests
- [Tutorial: Greenfield](/tutorial-greenfield/) — build a domain from scratch
- [Tutorial: Telemetry](/tutorial-telemetry/) — verify observability contracts alongside behavior
- [Multi-Adapter Testing](/guides/multi-adapter/) — add HTTP and Playwright adapters
- [Architecture](/architecture/) — how the three-layer model works and why
- [API Reference](/api/) — domains, adapters, protocols, and suites
