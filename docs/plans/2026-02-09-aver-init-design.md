# `aver init` CLI — Design

**Date**: 2026-02-09
**Branch**: TBD (off `main`)
**Status**: Design approved, ready for implementation

## Overview

Scaffolding CLI for bootstrapping Aver projects and domains. Two commands:
- `aver init` — project setup + first domain
- `aver init domain` — add a domain to an existing project

Developed BDD/TDD, dogfooding with Aver.

## Prerequisite: Rename `direct` → `unit`

Rename the in-process protocol from `direct()` to `unit()` across the codebase. Pre-1.0, no backwards compat shim needed.

Affected locations:
- `packages/aver/src/core/protocol.ts` — function + types
- `packages/aver/src/index.ts` — re-export
- All test files importing `direct`
- Example app adapter: `task-board.direct.ts` → `task-board.unit.ts`
- MCP server references
- Docs/plans

## Domain: `averInit`

```ts
const averInit = defineDomain({
  name: 'aver-init',
  actions: {
    initProject: action<{ dir: string }>(),
    initDomain: action<{ dir: string; name: string; protocol: string }>(),
  },
  queries: {
    fileContents: query<{ path: string }, string>(),
    generatedFiles: query<{ dir: string }, string[]>(),
  },
  assertions: {
    fileExists: assertion<{ path: string }>(),
    fileContains: assertion<{ path: string; content: string }>(),
    configRegistersAdapter: assertion<{ dir: string; adapterImport: string }>(),
  },
})
```

## Acceptance Tests (written first)

### Project Init
- **creates project structure** — `initProject` → assert `domains/`, `adapters/`, `tests/`, `aver.config.ts` exist
- **aver.config.ts has correct shape** — `initProject` → query `fileContents` → assert contains `defineConfig` and `adapters: []`

### Domain Init
- **generates domain file** — `initDomain({ name: 'taskBoard', protocol: 'unit' })` → assert `domains/task-board.ts` exists and contains `defineDomain`, `action`, `query`, `assertion`
- **generates adapter file** — assert `adapters/task-board.unit.ts` exists and contains `implement`, `unit`
- **generates test file** — assert `tests/task-board.spec.ts` exists and contains `suite`, `test`
- **updates aver.config.ts** — assert config imports and registers the new adapter
- **kebab-cases the filename** — `initDomain({ name: 'taskBoard' })` → files named `task-board.*`

### Edge Cases
- **initDomain without project** — `initDomain` on empty dir → throws (no `aver.config.ts`)
- **duplicate domain** — `initDomain` when domain file already exists → throws

## Adapter: `unit`

Calls scaffolding functions programmatically against a temp directory (created in setup, cleaned up in teardown). No CLI process spawning.

```ts
const averInitAdapter = implement(averInit, {
  protocol: unit(() => {
    const dir = mkdtempSync(join(tmpdir(), 'aver-init-'))
    return { dir }
  }),
  actions: {
    initProject: (ctx, { dir }) => initProjectFiles(dir),
    initDomain: (ctx, { dir, name, protocol }) => initDomainFiles(dir, name, protocol),
  },
  queries: {
    fileContents: (ctx, { path }) => readFileSync(path, 'utf-8'),
    generatedFiles: (ctx, { dir }) => readdirSync(dir, { recursive: true }),
  },
  assertions: {
    fileExists: (ctx, { path }) => { if (!existsSync(path)) throw new Error(`Missing: ${path}`) },
    fileContains: (ctx, { path, content }) => { ... },
    configRegistersAdapter: (ctx, { dir, adapterImport }) => { ... },
  },
})
```

## Implementation: Scaffolding Functions

Pure functions (no I/O prompts) that generate files. Testable without clack.

- `initProjectFiles(dir)` — creates dirs + `aver.config.ts`
- `initDomainFiles(dir, name, protocol)` — creates domain + adapter + test files, updates config
- `toKebabCase(name)` — `taskBoard` → `task-board`

## Implementation: CLI Integration

- `src/cli/init.ts` — clack prompts → calls scaffolding functions
- `src/cli/index.ts` — wire `init` and `init domain` subcommands

### Dependencies
- `@clack/prompts` — interactive CLI prompts (runtime dep, only used by CLI entry point)

## Generated File Templates

### `aver.config.ts` (project init)
```ts
import { defineConfig } from 'aver'

export default defineConfig({
  adapters: [],
})
```

### `domains/{name}.ts`
```ts
import { defineDomain, action, query, assertion } from 'aver'

export const {name} = defineDomain({
  name: '{kebab-name}',
  actions: {
    // Actions change system state. Define the payload type.
    // myAction: action<{ name: string }>(),
  },
  queries: {
    // Queries read data. Define <Payload, Return> types.
    // myQuery: query<{ id: string }, MyType>(),
  },
  assertions: {
    // Assertions verify expected state. They throw on failure.
    // myAssertion: assertion<{ expected: string }>(),
  },
})
```

### `adapters/{name}.{protocol}.ts`
```ts
import { implement, {protocol} } from 'aver'
import { {name} } from '../domains/{kebab-name}.js'

export const {protocol}Adapter = implement({name}, {
  protocol: {protocol}(() => {
    // Return your app context here.
  }),
  actions: {
    // Add a handler for each action in your domain.
  },
  queries: {
    // Add a handler for each query in your domain.
  },
  assertions: {
    // Add a handler for each assertion in your domain.
  },
})
```

### `tests/{name}.spec.ts`
```ts
import { suite } from 'aver'
import { {name} } from '../domains/{kebab-name}.js'
import '../aver.config.js'

const { test } = suite({name})

test('example test', async ({ act, query, assert }) => {
  // await act.myAction({ name: 'example' })
  // await assert.myAssertion({ expected: 'example' })
})
```

## CLI Flow

### `aver init`
```
◇ Welcome to Aver

◆ Creating project structure...
  ✓ domains/
  ✓ adapters/
  ✓ tests/
  ✓ aver.config.ts

◇ Let's create your first domain.

◆ Domain name?
  › taskBoard

◆ Which protocol?
  ❯ unit — in-process, no infrastructure
    http — calls your API over HTTP
    playwright — drives a browser

◇ Generated:
  ✓ domains/task-board.ts
  ✓ adapters/task-board.unit.ts
  ✓ tests/task-board.spec.ts
  ✓ Updated aver.config.ts

◇ Next steps:
  1. Define your vocabulary in domains/task-board.ts
  2. Wire up handlers in adapters/task-board.unit.ts
  3. Write tests in tests/task-board.spec.ts
  4. Run: npx aver run
```

### `aver init domain`
Same flow starting from "Domain name?" prompt. Errors if `aver.config.ts` doesn't exist.

## Implementation Order (TDD)

1. Rename `direct` → `unit` (mechanical, all tests must still pass)
2. Define `averInit` domain + adapter + test file with all acceptance tests (red)
3. Implement `initProjectFiles()` + `initDomainFiles()` pure functions (green)
4. Implement `toKebabCase()` utility
5. Wire CLI prompts with clack (integration, not acceptance-tested)
6. Verify full suite passes

## Test Counts (Expected)

| Test | Count |
|------|-------|
| Project init creates structure | 1 |
| Config has correct shape | 1 |
| Generates domain file | 1 |
| Generates adapter file | 1 |
| Generates test file | 1 |
| Updates config with adapter | 1 |
| Kebab-cases filenames | 1 |
| Errors without project | 1 |
| Errors on duplicate domain | 1 |
| **Total new** | **~9** |
