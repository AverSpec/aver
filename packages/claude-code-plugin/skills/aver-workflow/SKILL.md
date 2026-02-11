---
name: aver-workflow
description: Domain-first BDD workflow for Aver acceptance testing. Use when adding features, writing tests, or working with Aver domains and adapters.
---

# Aver Workflow

Aver is a domain-driven acceptance testing framework. Tests are written against a **domain vocabulary** (actions, queries, assertions), not implementation details. One test runs across multiple protocols (unit, HTTP, Playwright) via **adapters**.

## The Workflow

When adding a feature or writing tests, follow these 6 steps:

### 1. Explore — Understand existing vocabulary

Use MCP tools to see what's already defined:

- `list_domains` — see all registered domains
- `get_domain_vocabulary` — see actions, queries, assertions for a domain
- `list_adapters` — see which protocols are implemented

### 2. Locate — Find source files

Use `get_project_context` to discover file paths, then **read the domain file** to see TypeScript type signatures (phantom types are erased at runtime — the source file is the only place to see payload/return types).

### 3. Define — Add to the domain vocabulary

Add new `action()`, `query()`, or `assertion()` markers to the domain definition. TypeScript will flag all adapters that need updating.

```typescript
import { defineDomain, action, query, assertion } from 'aver'

export const myDomain = defineDomain({
  name: 'my-domain',
  actions: {
    doSomething: action<{ input: string }>(),
  },
  queries: {
    getSomething: query<{ id: string }, SomeType>(),
  },
  assertions: {
    somethingExists: assertion<{ id: string }>(),
  },
})
```

### 4. Test — Write the test first

Tests import the **domain**, never the adapter. The config import auto-registers adapters.

```typescript
import { suite } from 'aver'
import { myDomain } from '../domains/my-domain.js'

// Auto-register all adapters
// Config is loaded via vitest setupFiles (see vitest.config.ts)

const { test } = suite(myDomain)

test('describes the behavior', async ({ act, query, assert }) => {
  await act.doSomething({ input: 'hello' })
  const result = await query.getSomething({ id: '1' })
  await assert.somethingExists({ id: '1' })
})
```

### 5. Implement — Add handlers to each adapter

Each adapter binds the domain vocabulary to a protocol. TypeScript flags missing handlers.

**Unit adapter** — direct function calls:
```typescript
import { implement, unit } from 'aver'
import { myDomain } from '../domains/my-domain.js'

export const unitAdapter = implement(myDomain, {
  protocol: unit(() => createFreshState()),
  actions: {
    doSomething: async (state, { input }) => { /* mutate state */ },
  },
  queries: {
    getSomething: async (state, { id }) => { /* return data */ },
  },
  assertions: {
    somethingExists: async (state, { id }) => {
      if (!exists(state, id)) throw new Error(`Not found: ${id}`)
    },
  },
})
```

**Key rule:** Assertions **throw** on failure. They never return booleans.

### 6. Verify — Run tests and check results

- `run_tests` — run the full suite (or filter by domain/adapter)
- `get_run_diff` — compare with previous run to see newly passing/failing tests
- `get_failure_details` — inspect failures with error messages and traces

## Conventions

| Concept | Pattern | Example |
|---------|---------|---------|
| Domain variable | camelCase | `taskBoard` |
| Domain name field | kebab-case | `'task-board'` |
| Domain file | `domains/{kebab}.ts` | `domains/task-board.ts` |
| Adapter file | `adapters/{kebab}.{protocol}.ts` | `adapters/task-board.unit.ts` |
| Test file | `tests/{kebab}.spec.ts` | `tests/task-board.spec.ts` |
| Config file | `aver.config.ts` | `aver.config.ts` |

## Config

The config file registers adapters so tests can find them:

```typescript
import { defineConfig } from 'aver'
import { unitAdapter } from './adapters/my-domain.unit.js'
import { httpAdapter } from './adapters/my-domain.http.js'

export default defineConfig({
  adapters: [unitAdapter, httpAdapter],
})
```

## Multi-Adapter Testing

When `suite(domain)` is called without a specific adapter, it runs tests against **all registered adapters** for that domain. Test names are parameterized as `test name [protocol]`.

## Further Reading

- `patterns.md` — complete code examples for all patterns
- `examples/task-board.md` — real walkthrough of adding a feature to the task-board example app
