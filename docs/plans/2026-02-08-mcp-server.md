# @aver/mcp-server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an MCP server package that exposes Aver's domain-driven testing capabilities to AI agents via 9 tools over stdio.

**Architecture:** Separate `packages/mcp-server` package using the official `@modelcontextprotocol/sdk` with stdio transport. On startup, imports the user's `aver.config.ts` to populate the adapter registry, then exposes 9 MCP tools organized in 4 groups: domain exploration (3), test execution (3), scaffolding (2), incremental reporting (1). Test results persist to `.aver/runs/` as timestamped JSON files.

**Tech Stack:** `@modelcontextprotocol/sdk` (MCP), `zod@3` (tool input schemas), `aver` (peer dep for registry/types). TypeScript, tsup, vitest.

---

## Task 0: Add `_getAdapters()` to Core Registry

The MCP server needs to enumerate all registered adapters for `list_domains` and `list_adapters`. Currently the registry only has `_findAdapter(domain)` and `_registerAdapter(adapter)`.

**Files:**
- Modify: `packages/aver/src/core/registry.ts`
- Modify: `packages/aver/src/index.ts`
- Modify: `packages/aver/test/core/suite.spec.ts` (add test for new function)

**Step 1: Write the failing test**

Add to the existing suite.spec.ts (which already tests registry behavior):

```ts
// Add to packages/aver/test/core/suite.spec.ts, inside a new describe block

describe('_getAdapters()', () => {
  beforeEach(() => {
    _resetRegistry()
  })

  it('returns empty array when no adapters registered', () => {
    expect(_getAdapters()).toEqual([])
  })

  it('returns all registered adapters', () => {
    _registerAdapter(cartAdapter)
    const adapters = _getAdapters()
    expect(adapters).toHaveLength(1)
    expect(adapters[0].domain).toBe(cart)
  })

  it('returns a copy, not the internal array', () => {
    _registerAdapter(cartAdapter)
    const a1 = _getAdapters()
    const a2 = _getAdapters()
    expect(a1).not.toBe(a2)
    expect(a1).toEqual(a2)
  })
})
```

Update the import at the top of suite.spec.ts to also import `_getAdapters`:

```ts
import { _resetRegistry, _registerAdapter, _getAdapters } from '../../src/core/registry'
```

**Step 2: Run test to verify it fails**

Run: `cd packages/aver && npx vitest run test/core/suite.spec.ts`
Expected: FAIL — `_getAdapters` is not exported

**Step 3: Add `_getAdapters()` to registry**

Add to `packages/aver/src/core/registry.ts`:

```ts
export function _getAdapters(): Adapter[] {
  return [...adapters]
}
```

**Step 4: Export from public API**

Add to `packages/aver/src/index.ts` alongside the existing internal re-exports that the MCP server will need:

```ts
export { _getAdapters, _registerAdapter, _findAdapter, _resetRegistry } from './core/registry'
```

Note: `_registerAdapter`, `_findAdapter`, and `_resetRegistry` are currently NOT exported from index.ts — they're imported directly from `./core/registry` by test files. We should export them from index.ts now so the MCP server can import from `aver` rather than reaching into internal paths.

**Step 5: Run test to verify it passes**

Run: `cd packages/aver && npx vitest run test/core/suite.spec.ts`
Expected: All tests PASS (existing + 3 new).

**Step 6: Run full test suite**

Run: `cd packages/aver && npx vitest run`
Expected: All tests PASS.

**Step 7: Commit**

```bash
git add packages/aver/src/core/registry.ts packages/aver/src/index.ts packages/aver/test/core/suite.spec.ts
git commit -m "feat: add _getAdapters() to registry and export registry functions"
```

---

## Task 1: Package Scaffolding

**Files:**
- Create: `packages/mcp-server/package.json`
- Create: `packages/mcp-server/tsconfig.json`
- Create: `packages/mcp-server/tsup.config.ts`
- Create: `packages/mcp-server/vitest.config.ts`
- Create: `packages/mcp-server/src/index.ts` (placeholder)
- Modify: `.gitignore` (add `.aver/`)

**Step 1: Create `packages/mcp-server/package.json`**

```json
{
  "name": "@aver/mcp-server",
  "version": "0.1.0",
  "description": "MCP server for Aver domain-driven acceptance testing",
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=18.0.0" },
  "bin": { "aver-mcp": "./dist/index.js" },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.26.0",
    "zod": "^3.24.0"
  },
  "peerDependencies": {
    "aver": "*"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0",
    "aver": "*"
  }
}
```

**Step 2: Create `packages/mcp-server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.spec.ts", "**/*.test.ts"]
}
```

**Step 3: Create `packages/mcp-server/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['aver'],
  banner: { js: '#!/usr/bin/env node' },
})
```

**Step 4: Create `packages/mcp-server/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
  },
})
```

**Step 5: Create placeholder `packages/mcp-server/src/index.ts`**

```ts
// @aver/mcp-server — MCP server for Aver
console.error('@aver/mcp-server starting...')
```

**Step 6: Add `.aver/` to `.gitignore`**

Append `.aver/` to the root `.gitignore`.

**Step 7: Install dependencies**

Run: `npm install`
Expected: Clean install, no errors.

**Step 8: Verify build**

Run: `cd packages/mcp-server && npx tsup`
Expected: Build succeeds, `dist/index.js` created with shebang.

**Step 9: Commit**

```bash
git add packages/mcp-server/ .gitignore
git commit -m "chore: scaffold @aver/mcp-server package"
```

---

## Task 2: Config Discovery + Server Bootstrap

The MCP server needs to find and import `aver.config.ts`, which registers adapters into the module-level registry. Then start the MCP server on stdio.

**Files:**
- Create: `packages/mcp-server/src/config.ts`
- Create: `packages/mcp-server/src/server.ts`
- Modify: `packages/mcp-server/src/index.ts`
- Test: `packages/mcp-server/test/config.spec.ts`

**Step 1: Write the failing test**

```ts
// packages/mcp-server/test/config.spec.ts
import { describe, it, expect } from 'vitest'
import { resolveConfigPath } from '../src/config'

describe('resolveConfigPath()', () => {
  it('returns --config flag value when provided', () => {
    const result = resolveConfigPath(['--config', '/tmp/my.config.ts'])
    expect(result).toBe('/tmp/my.config.ts')
  })

  it('returns undefined when no flag and no file exists', () => {
    const result = resolveConfigPath([], '/nonexistent/path')
    expect(result).toBeUndefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run test/config.spec.ts`
Expected: FAIL — cannot resolve `../src/config`

**Step 3: Write config discovery**

```ts
// packages/mcp-server/src/config.ts
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

const CONFIG_FILENAMES = ['aver.config.ts', 'aver.config.js', 'aver.config.mjs']

export function resolveConfigPath(argv: string[], cwd?: string): string | undefined {
  // Check --config flag
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        config: { type: 'string' },
      },
      strict: false,
    })
    if (values.config) return values.config as string
  } catch {
    // ignore parse errors
  }

  // Auto-detect from cwd
  const dir = cwd ?? process.cwd()
  for (const filename of CONFIG_FILENAMES) {
    const candidate = resolve(dir, filename)
    if (existsSync(candidate)) return candidate
  }

  return undefined
}

export async function loadConfig(configPath: string): Promise<void> {
  // Dynamic import triggers the config module, which calls defineConfig()
  // and registers adapters via side effects
  await import(configPath)
}
```

**Step 4: Write the MCP server setup**

```ts
// packages/mcp-server/src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

export function createServer(): McpServer {
  return new McpServer({
    name: 'aver',
    version: '0.1.0',
  })
}

export async function startServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('aver MCP server running on stdio')
}
```

**Step 5: Wire up the entry point**

```ts
// packages/mcp-server/src/index.ts
export {}

import { resolveConfigPath, loadConfig } from './config.js'
import { createServer, startServer } from './server.js'
import { registerTools } from './tools/index.js'

const configPath = resolveConfigPath(process.argv.slice(2))

if (configPath) {
  console.error(`aver: loading config from ${configPath}`)
  await loadConfig(configPath)
} else {
  console.error('aver: no config file found, starting with empty registry')
}

const server = createServer()
registerTools(server)
await startServer(server)
```

Create the tools barrel (placeholder for now):

```ts
// packages/mcp-server/src/tools/index.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function registerTools(server: McpServer): void {
  // Tools will be registered in subsequent tasks
}
```

**Step 6: Run test to verify it passes**

Run: `cd packages/mcp-server && npx vitest run test/config.spec.ts`
Expected: Both tests PASS.

**Step 7: Verify build**

Run: `cd packages/mcp-server && npx tsup`
Expected: Build succeeds.

**Step 8: Commit**

```bash
git add packages/mcp-server/
git commit -m "feat: add config discovery and MCP server bootstrap"
```

---

## Task 3: Domain Exploration Tools (list_domains, get_domain_vocabulary, list_adapters)

**Files:**
- Create: `packages/mcp-server/src/tools/domains.ts`
- Modify: `packages/mcp-server/src/tools/index.ts`
- Test: `packages/mcp-server/test/tools/domains.spec.ts`

**Step 1: Write the failing test**

```ts
// packages/mcp-server/test/tools/domains.spec.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  listDomainsHandler,
  getDomainVocabularyHandler,
  listAdaptersHandler,
} from '../../src/tools/domains'
import {
  defineDomain, action, query, assertion,
  implement, direct,
  _resetRegistry, _registerAdapter,
} from 'aver'

const cart = defineDomain({
  name: 'Cart',
  actions: { addItem: action<{ name: string }>(), checkout: action() },
  queries: { total: query<number>() },
  assertions: { isEmpty: assertion() },
})

const cartAdapter = implement(cart, {
  protocol: direct(() => null),
  actions: {
    addItem: async () => {},
    checkout: async () => {},
  },
  queries: { total: async () => 0 },
  assertions: { isEmpty: async () => {} },
})

describe('list_domains handler', () => {
  beforeEach(() => {
    _resetRegistry()
  })

  it('returns empty array when no adapters registered', () => {
    const result = listDomainsHandler()
    expect(result).toEqual([])
  })

  it('returns domain summaries from registered adapters', () => {
    _registerAdapter(cartAdapter)
    const result = listDomainsHandler()
    expect(result).toEqual([
      {
        name: 'Cart',
        actions: ['addItem', 'checkout'],
        queries: ['total'],
        assertions: ['isEmpty'],
        actionCount: 2,
        queryCount: 1,
        assertionCount: 1,
      },
    ])
  })

  it('deduplicates domains when multiple adapters share a domain', () => {
    _registerAdapter(cartAdapter)
    const cartAdapter2 = implement(cart, {
      protocol: direct(() => null),
      actions: { addItem: async () => {}, checkout: async () => {} },
      queries: { total: async () => 0 },
      assertions: { isEmpty: async () => {} },
    })
    _registerAdapter(cartAdapter2)
    const result = listDomainsHandler()
    expect(result).toHaveLength(1)
  })
})

describe('get_domain_vocabulary handler', () => {
  beforeEach(() => {
    _resetRegistry()
    _registerAdapter(cartAdapter)
  })

  it('returns vocabulary for a named domain', () => {
    const result = getDomainVocabularyHandler('Cart')
    expect(result).toEqual({
      name: 'Cart',
      actions: ['addItem', 'checkout'],
      queries: ['total'],
      assertions: ['isEmpty'],
    })
  })

  it('returns null for unknown domain', () => {
    const result = getDomainVocabularyHandler('Unknown')
    expect(result).toBeNull()
  })
})

describe('list_adapters handler', () => {
  beforeEach(() => {
    _resetRegistry()
  })

  it('returns empty array when no adapters registered', () => {
    const result = listAdaptersHandler()
    expect(result).toEqual([])
  })

  it('returns adapter summaries', () => {
    _registerAdapter(cartAdapter)
    const result = listAdaptersHandler()
    expect(result).toEqual([
      { domainName: 'Cart', protocolName: 'direct' },
    ])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run test/tools/domains.spec.ts`
Expected: FAIL — cannot resolve `../../src/tools/domains`

**Step 3: Write the domain exploration handlers**

```ts
// packages/mcp-server/src/tools/domains.ts
import { _getAdapters } from 'aver'
import type { Domain, Adapter } from 'aver'

export interface DomainSummary {
  name: string
  actions: string[]
  queries: string[]
  assertions: string[]
  actionCount: number
  queryCount: number
  assertionCount: number
}

export interface DomainVocabulary {
  name: string
  actions: string[]
  queries: string[]
  assertions: string[]
}

export interface AdapterSummary {
  domainName: string
  protocolName: string
}

function getUniqueDomains(): Map<string, Domain> {
  const adapters = _getAdapters()
  const domains = new Map<string, Domain>()
  for (const adapter of adapters) {
    if (!domains.has(adapter.domain.name)) {
      domains.set(adapter.domain.name, adapter.domain)
    }
  }
  return domains
}

export function listDomainsHandler(): DomainSummary[] {
  const domains = getUniqueDomains()
  return Array.from(domains.values()).map((domain) => {
    const actions = Object.keys(domain.vocabulary.actions)
    const queries = Object.keys(domain.vocabulary.queries)
    const assertions = Object.keys(domain.vocabulary.assertions)
    return {
      name: domain.name,
      actions,
      queries,
      assertions,
      actionCount: actions.length,
      queryCount: queries.length,
      assertionCount: assertions.length,
    }
  })
}

export function getDomainVocabularyHandler(domainName: string): DomainVocabulary | null {
  const domains = getUniqueDomains()
  const domain = domains.get(domainName)
  if (!domain) return null
  return {
    name: domain.name,
    actions: Object.keys(domain.vocabulary.actions),
    queries: Object.keys(domain.vocabulary.queries),
    assertions: Object.keys(domain.vocabulary.assertions),
  }
}

export function listAdaptersHandler(): AdapterSummary[] {
  return _getAdapters().map((adapter) => ({
    domainName: adapter.domain.name,
    protocolName: adapter.protocol.name,
  }))
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/mcp-server && npx vitest run test/tools/domains.spec.ts`
Expected: All tests PASS.

**Step 5: Register tools with MCP server**

Update `packages/mcp-server/src/tools/index.ts`:

```ts
// packages/mcp-server/src/tools/index.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { listDomainsHandler, getDomainVocabularyHandler, listAdaptersHandler } from './domains.js'

export function registerTools(server: McpServer): void {
  registerDomainTools(server)
}

function registerDomainTools(server: McpServer): void {
  server.registerTool(
    'list_domains',
    { description: 'List all registered domains with vocabulary summaries' },
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(listDomainsHandler(), null, 2) }],
    }),
  )

  server.registerTool(
    'get_domain_vocabulary',
    {
      description: 'Get the full vocabulary (actions, queries, assertions) for a named domain',
      inputSchema: { domain: z.string().describe('Domain name') },
    },
    async ({ domain }) => {
      const result = getDomainVocabularyHandler(domain)
      if (!result) {
        return { content: [{ type: 'text', text: `Domain "${domain}" not found` }] }
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'list_adapters',
    { description: 'List all registered adapters with their domain and protocol names' },
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(listAdaptersHandler(), null, 2) }],
    }),
  )
}
```

**Step 6: Verify build**

Run: `cd packages/mcp-server && npx tsup`
Expected: Build succeeds.

**Step 7: Commit**

```bash
git add packages/mcp-server/
git commit -m "feat: add domain exploration MCP tools (list_domains, get_domain_vocabulary, list_adapters)"
```

---

## Task 4: Run Persistence Layer

Test results persist to `.aver/runs/` as timestamped JSON files. This is shared infrastructure for the test execution and incremental reporting tools.

**Files:**
- Create: `packages/mcp-server/src/runs.ts`
- Test: `packages/mcp-server/test/runs.spec.ts`

**Step 1: Write the failing test**

```ts
// packages/mcp-server/test/runs.spec.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RunStore } from '../src/runs'

describe('RunStore', () => {
  let dir: string
  let store: RunStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aver-runs-'))
    store = new RunStore(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('saves and retrieves a run', () => {
    const run = {
      timestamp: '2026-02-08T14:30:00.000Z',
      results: [
        { testName: 'test1', domain: 'Cart', status: 'pass' as const, trace: [] },
      ],
    }
    store.save(run)
    const latest = store.getLatest()
    expect(latest).toEqual(run)
  })

  it('returns undefined when no runs exist', () => {
    expect(store.getLatest()).toBeUndefined()
  })

  it('returns the two most recent runs for diffing', () => {
    const run1 = { timestamp: '2026-02-08T14:00:00.000Z', results: [] }
    const run2 = { timestamp: '2026-02-08T14:30:00.000Z', results: [] }
    store.save(run1)
    store.save(run2)
    const [prev, curr] = store.getLastTwo()
    expect(prev?.timestamp).toBe('2026-02-08T14:00:00.000Z')
    expect(curr?.timestamp).toBe('2026-02-08T14:30:00.000Z')
  })

  it('enforces retention limit of 10 runs', () => {
    for (let i = 0; i < 12; i++) {
      store.save({ timestamp: `2026-02-08T${String(i).padStart(2, '0')}:00:00.000Z`, results: [] })
    }
    const files = store.listRuns()
    expect(files.length).toBeLessThanOrEqual(10)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run test/runs.spec.ts`
Expected: FAIL — cannot resolve `../src/runs`

**Step 3: Write the RunStore**

```ts
// packages/mcp-server/src/runs.ts
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface TestResult {
  testName: string
  domain: string
  status: 'pass' | 'fail' | 'skip'
  trace: Array<{ kind: string; name: string; status: string; error?: string }>
}

export interface RunData {
  timestamp: string
  results: TestResult[]
}

const MAX_RUNS = 10

export class RunStore {
  private dir: string

  constructor(dir: string) {
    this.dir = dir
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }

  save(run: RunData): void {
    const filename = run.timestamp.replace(/[:.]/g, '-') + '.json'
    writeFileSync(join(this.dir, filename), JSON.stringify(run, null, 2))
    this.enforceRetention()
  }

  getLatest(): RunData | undefined {
    const files = this.listRuns()
    if (files.length === 0) return undefined
    return this.readRun(files[files.length - 1])
  }

  getLastTwo(): [RunData | undefined, RunData | undefined] {
    const files = this.listRuns()
    if (files.length === 0) return [undefined, undefined]
    if (files.length === 1) return [undefined, this.readRun(files[0])]
    return [
      this.readRun(files[files.length - 2]),
      this.readRun(files[files.length - 1]),
    ]
  }

  listRuns(): string[] {
    if (!existsSync(this.dir)) return []
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
  }

  private readRun(filename: string): RunData {
    return JSON.parse(readFileSync(join(this.dir, filename), 'utf-8'))
  }

  private enforceRetention(): void {
    const files = this.listRuns()
    while (files.length > MAX_RUNS) {
      const oldest = files.shift()!
      unlinkSync(join(this.dir, oldest))
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/mcp-server && npx vitest run test/runs.spec.ts`
Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add packages/mcp-server/src/runs.ts packages/mcp-server/test/runs.spec.ts
git commit -m "feat: add RunStore for persisting test results to .aver/runs/"
```

---

## Task 5: Test Execution Tools (run_tests, get_failure_details, get_test_trace)

These tools shell out to `npx vitest run --reporter=json` to execute tests, then parse and store results. Progressive detail: summary → failure traces → full traces.

**Files:**
- Create: `packages/mcp-server/src/tools/execution.ts`
- Modify: `packages/mcp-server/src/tools/index.ts`
- Test: `packages/mcp-server/test/tools/execution.spec.ts`

**Step 1: Write the failing test**

We test the handler logic (parsing vitest JSON output, building RunData) — not actually shelling out to vitest. The handler accepts parsed JSON so it's testable without spawning processes.

```ts
// packages/mcp-server/test/tools/execution.spec.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RunStore } from '../../src/runs'
import {
  buildRunSummary,
  getFailureDetailsHandler,
  getTestTraceHandler,
} from '../../src/tools/execution'

describe('buildRunSummary()', () => {
  it('builds a summary from run data', () => {
    const run = {
      timestamp: '2026-02-08T14:30:00.000Z',
      results: [
        { testName: 'test1', domain: 'Cart', status: 'pass' as const, trace: [] },
        { testName: 'test2', domain: 'Cart', status: 'fail' as const, trace: [
          { kind: 'assertion', name: 'isEmpty', status: 'fail', error: 'Expected empty' },
        ]},
        { testName: 'test3', domain: 'Auth', status: 'pass' as const, trace: [] },
      ],
    }
    const summary = buildRunSummary(run)
    expect(summary.total).toBe(3)
    expect(summary.passed).toBe(2)
    expect(summary.failed).toBe(1)
    expect(summary.failures).toEqual([
      { testName: 'test2', domain: 'Cart' },
    ])
  })
})

describe('getFailureDetailsHandler()', () => {
  let dir: string
  let store: RunStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aver-exec-'))
    store = new RunStore(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns failure details from the latest run', () => {
    store.save({
      timestamp: '2026-02-08T14:30:00.000Z',
      results: [
        { testName: 'test1', domain: 'Cart', status: 'pass', trace: [] },
        { testName: 'test2', domain: 'Cart', status: 'fail', trace: [
          { kind: 'action', name: 'addItem', status: 'pass' },
          { kind: 'assertion', name: 'isEmpty', status: 'fail', error: 'not empty' },
        ]},
      ],
    })
    const result = getFailureDetailsHandler(store)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].testName).toBe('test2')
    expect(result.failures[0].trace).toHaveLength(2)
  })

  it('filters by domain when provided', () => {
    store.save({
      timestamp: '2026-02-08T14:30:00.000Z',
      results: [
        { testName: 't1', domain: 'Cart', status: 'fail', trace: [] },
        { testName: 't2', domain: 'Auth', status: 'fail', trace: [] },
      ],
    })
    const result = getFailureDetailsHandler(store, { domain: 'Cart' })
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].domain).toBe('Cart')
  })
})

describe('getTestTraceHandler()', () => {
  let dir: string
  let store: RunStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aver-trace-'))
    store = new RunStore(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns the trace for a named test', () => {
    store.save({
      timestamp: '2026-02-08T14:30:00.000Z',
      results: [
        { testName: 'my test', domain: 'Cart', status: 'pass', trace: [
          { kind: 'action', name: 'addItem', status: 'pass' },
          { kind: 'query', name: 'total', status: 'pass' },
        ]},
      ],
    })
    const result = getTestTraceHandler(store, 'my test')
    expect(result?.trace).toHaveLength(2)
  })

  it('returns null for unknown test', () => {
    store.save({
      timestamp: '2026-02-08T14:30:00.000Z',
      results: [],
    })
    const result = getTestTraceHandler(store, 'nonexistent')
    expect(result).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run test/tools/execution.spec.ts`
Expected: FAIL — cannot resolve modules

**Step 3: Write the execution handlers**

```ts
// packages/mcp-server/src/tools/execution.ts
import { execFileSync } from 'node:child_process'
import type { RunStore, RunData, TestResult } from '../runs.js'

export interface RunSummary {
  runId: string
  total: number
  passed: number
  failed: number
  skipped: number
  failures: Array<{ testName: string; domain: string }>
}

export function buildRunSummary(run: RunData): RunSummary {
  const passed = run.results.filter((r) => r.status === 'pass').length
  const failed = run.results.filter((r) => r.status === 'fail').length
  const skipped = run.results.filter((r) => r.status === 'skip').length
  return {
    runId: run.timestamp,
    total: run.results.length,
    passed,
    failed,
    skipped,
    failures: run.results
      .filter((r) => r.status === 'fail')
      .map((r) => ({ testName: r.testName, domain: r.domain })),
  }
}

export function runTestsHandler(
  store: RunStore,
  opts?: { domain?: string; adapter?: string },
): RunSummary {
  const vitestArgs = ['vitest', 'run', '--reporter=json']

  const env: Record<string, string> = { ...process.env as Record<string, string> }
  if (opts?.domain) env.AVER_DOMAIN = opts.domain
  if (opts?.adapter) env.AVER_ADAPTER = opts.adapter

  let jsonOutput: string
  try {
    jsonOutput = execFileSync('npx', vitestArgs, {
      env,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (err: any) {
    // vitest exits non-zero on test failures but still outputs JSON
    jsonOutput = err.stdout ?? ''
  }

  // Parse vitest JSON output into our RunData format
  const run = parseVitestJson(jsonOutput)
  store.save(run)
  return buildRunSummary(run)
}

function parseVitestJson(jsonStr: string): RunData {
  const timestamp = new Date().toISOString()
  const results: TestResult[] = []

  try {
    const parsed = JSON.parse(jsonStr)
    const testResults = parsed.testResults ?? []
    for (const file of testResults) {
      for (const test of file.assertionResults ?? []) {
        results.push({
          testName: test.fullName ?? test.title ?? 'unknown',
          domain: extractDomainFromPath(file.name ?? ''),
          status: test.status === 'passed' ? 'pass' : test.status === 'failed' ? 'fail' : 'skip',
          trace: [], // vitest JSON doesn't include aver traces — future enhancement
        })
      }
    }
  } catch {
    // If we can't parse JSON, return empty results
  }

  return { timestamp, results }
}

function extractDomainFromPath(filePath: string): string {
  // Best-effort domain extraction from test file path
  const match = filePath.match(/acceptance\/([^/]+)/)
  return match?.[1] ?? 'unknown'
}

export interface FailureDetails {
  failures: Array<{
    testName: string
    domain: string
    error?: string
    trace: Array<{ kind: string; name: string; status: string; error?: string }>
  }>
}

export function getFailureDetailsHandler(
  store: RunStore,
  opts?: { domain?: string; testName?: string },
): FailureDetails {
  const run = store.getLatest()
  if (!run) return { failures: [] }

  let failures = run.results.filter((r) => r.status === 'fail')
  if (opts?.domain) failures = failures.filter((r) => r.domain === opts.domain)
  if (opts?.testName) failures = failures.filter((r) => r.testName === opts.testName)

  return {
    failures: failures.map((r) => ({
      testName: r.testName,
      domain: r.domain,
      error: r.trace.find((t) => t.error)?.error,
      trace: r.trace,
    })),
  }
}

export interface TestTrace {
  testName: string
  domain: string
  status: string
  trace: Array<{ kind: string; name: string; status: string; error?: string }>
}

export function getTestTraceHandler(
  store: RunStore,
  testName: string,
): TestTrace | null {
  const run = store.getLatest()
  if (!run) return null

  const result = run.results.find((r) => r.testName === testName)
  if (!result) return null

  return {
    testName: result.testName,
    domain: result.domain,
    status: result.status,
    trace: result.trace,
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/mcp-server && npx vitest run test/tools/execution.spec.ts`
Expected: All tests PASS.

**Step 5: Register execution tools with MCP server**

Update `packages/mcp-server/src/tools/index.ts`:

```ts
// packages/mcp-server/src/tools/index.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { listDomainsHandler, getDomainVocabularyHandler, listAdaptersHandler } from './domains.js'
import { runTestsHandler, getFailureDetailsHandler, getTestTraceHandler } from './execution.js'
import { RunStore } from '../runs.js'
import { join } from 'node:path'

export function registerTools(server: McpServer): void {
  const store = new RunStore(join(process.cwd(), '.aver', 'runs'))

  registerDomainTools(server)
  registerExecutionTools(server, store)
}

function registerDomainTools(server: McpServer): void {
  server.registerTool(
    'list_domains',
    { description: 'List all registered domains with vocabulary summaries' },
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(listDomainsHandler(), null, 2) }],
    }),
  )

  server.registerTool(
    'get_domain_vocabulary',
    {
      description: 'Get the full vocabulary (actions, queries, assertions) for a named domain',
      inputSchema: { domain: z.string().describe('Domain name') },
    },
    async ({ domain }) => {
      const result = getDomainVocabularyHandler(domain)
      if (!result) {
        return { content: [{ type: 'text', text: `Domain "${domain}" not found` }] }
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.registerTool(
    'list_adapters',
    { description: 'List all registered adapters with their domain and protocol names' },
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(listAdaptersHandler(), null, 2) }],
    }),
  )
}

function registerExecutionTools(server: McpServer, store: RunStore): void {
  server.registerTool(
    'run_tests',
    {
      description: 'Run acceptance tests and return a summary. Optionally filter by domain or adapter.',
      inputSchema: {
        domain: z.string().optional().describe('Filter tests by domain name'),
        adapter: z.string().optional().describe('Filter tests by adapter/protocol name'),
      },
    },
    async ({ domain, adapter }) => {
      const summary = runTestsHandler(store, { domain, adapter })
      return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] }
    },
  )

  server.registerTool(
    'get_failure_details',
    {
      description: 'Get action traces for failed tests from the most recent run',
      inputSchema: {
        domain: z.string().optional().describe('Filter by domain name'),
        testName: z.string().optional().describe('Filter by test name'),
      },
    },
    async ({ domain, testName }) => {
      const details = getFailureDetailsHandler(store, { domain, testName })
      return { content: [{ type: 'text', text: JSON.stringify(details, null, 2) }] }
    },
  )

  server.registerTool(
    'get_test_trace',
    {
      description: 'Get the full action trace for any test by name (pass or fail)',
      inputSchema: {
        testName: z.string().describe('Exact test name'),
      },
    },
    async ({ testName }) => {
      const trace = getTestTraceHandler(store, testName)
      if (!trace) {
        return { content: [{ type: 'text', text: `Test "${testName}" not found in latest run` }] }
      }
      return { content: [{ type: 'text', text: JSON.stringify(trace, null, 2) }] }
    },
  )
}
```

**Step 6: Verify build**

Run: `cd packages/mcp-server && npx tsup`
Expected: Build succeeds.

**Step 7: Commit**

```bash
git add packages/mcp-server/
git commit -m "feat: add test execution MCP tools (run_tests, get_failure_details, get_test_trace)"
```

---

## Task 6: Scaffolding Tools (describe_domain_structure, describe_adapter_structure)

**Files:**
- Create: `packages/mcp-server/src/tools/scaffolding.ts`
- Modify: `packages/mcp-server/src/tools/index.ts`
- Test: `packages/mcp-server/test/tools/scaffolding.spec.ts`

**Step 1: Write the failing test**

```ts
// packages/mcp-server/test/tools/scaffolding.spec.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  describeDomainStructureHandler,
  describeAdapterStructureHandler,
} from '../../src/tools/scaffolding'
import {
  defineDomain, action, query, assertion,
  implement, direct,
  _resetRegistry, _registerAdapter,
} from 'aver'

const cart = defineDomain({
  name: 'Cart',
  actions: { addItem: action(), removeItem: action() },
  queries: { total: query<number>() },
  assertions: { isEmpty: assertion(), hasTotal: assertion() },
})

const cartAdapter = implement(cart, {
  protocol: direct(() => null),
  actions: { addItem: async () => {}, removeItem: async () => {} },
  queries: { total: async () => 0 },
  assertions: { isEmpty: async () => {}, hasTotal: async () => {} },
})

describe('describe_domain_structure handler', () => {
  it('returns a template structure from a description', () => {
    const result = describeDomainStructureHandler('shopping cart')
    expect(result.suggestedName).toBe('shoppingCart')
    expect(result.actions).toBeDefined()
    expect(result.queries).toBeDefined()
    expect(result.assertions).toBeDefined()
    // Template always has placeholder entries
    expect(result.actions.length).toBeGreaterThan(0)
  })
})

describe('describe_adapter_structure handler', () => {
  beforeEach(() => {
    _resetRegistry()
    _registerAdapter(cartAdapter)
  })

  it('returns handler structure for a domain and protocol', () => {
    const result = describeAdapterStructureHandler('Cart', 'direct')
    expect(result).toEqual({
      domain: 'Cart',
      protocol: 'direct',
      handlers: {
        actions: ['addItem', 'removeItem'],
        queries: ['total'],
        assertions: ['isEmpty', 'hasTotal'],
      },
    })
  })

  it('returns null when domain not found', () => {
    const result = describeAdapterStructureHandler('Unknown', 'direct')
    expect(result).toBeNull()
  })

  it('returns null when adapter for protocol not found', () => {
    const result = describeAdapterStructureHandler('Cart', 'playwright')
    expect(result).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run test/tools/scaffolding.spec.ts`
Expected: FAIL — cannot resolve modules

**Step 3: Write the scaffolding handlers**

```ts
// packages/mcp-server/src/tools/scaffolding.ts
import { _getAdapters } from 'aver'

export interface DomainStructure {
  suggestedName: string
  actions: Array<{ name: string; payloadDescription: string }>
  queries: Array<{ name: string; returnDescription: string }>
  assertions: Array<{ name: string; payloadDescription: string }>
}

export interface AdapterStructure {
  domain: string
  protocol: string
  handlers: {
    actions: string[]
    queries: string[]
    assertions: string[]
  }
}

function toCamelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
}

export function describeDomainStructureHandler(description: string): DomainStructure {
  const suggestedName = toCamelCase(description)

  // Return a template structure. The server provides patterns; the agent does the thinking.
  return {
    suggestedName,
    actions: [
      { name: 'create', payloadDescription: 'data to create the resource' },
      { name: 'update', payloadDescription: 'fields to update' },
      { name: 'delete', payloadDescription: 'none' },
    ],
    queries: [
      { name: 'getAll', returnDescription: 'list of resources' },
      { name: 'getById', returnDescription: 'single resource' },
    ],
    assertions: [
      { name: 'exists', payloadDescription: 'identifier' },
      { name: 'hasCount', payloadDescription: 'expected count' },
    ],
  }
}

export function describeAdapterStructureHandler(
  domainName: string,
  protocolName: string,
): AdapterStructure | null {
  const adapters = _getAdapters()
  const adapter = adapters.find(
    (a) => a.domain.name === domainName && a.protocol.name === protocolName,
  )
  if (!adapter) return null

  return {
    domain: domainName,
    protocol: protocolName,
    handlers: {
      actions: Object.keys(adapter.domain.vocabulary.actions),
      queries: Object.keys(adapter.domain.vocabulary.queries),
      assertions: Object.keys(adapter.domain.vocabulary.assertions),
    },
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/mcp-server && npx vitest run test/tools/scaffolding.spec.ts`
Expected: All tests PASS.

**Step 5: Register scaffolding tools with MCP server**

Add to `packages/mcp-server/src/tools/index.ts` — add `registerScaffoldingTools(server)` call in `registerTools()`, and add the function:

```ts
import { describeDomainStructureHandler, describeAdapterStructureHandler } from './scaffolding.js'

// In registerTools():
registerScaffoldingTools(server)

// New function:
function registerScaffoldingTools(server: McpServer): void {
  server.registerTool(
    'describe_domain_structure',
    {
      description: 'Get a template domain structure based on a description. Returns suggested actions, queries, and assertions for the agent to adapt.',
      inputSchema: {
        description: z.string().describe('Brief description of the domain (e.g. "shopping cart", "user authentication")'),
      },
    },
    async ({ description }) => ({
      content: [{ type: 'text', text: JSON.stringify(describeDomainStructureHandler(description), null, 2) }],
    }),
  )

  server.registerTool(
    'describe_adapter_structure',
    {
      description: 'Get the handler structure needed to implement an adapter for a domain with a specific protocol',
      inputSchema: {
        domain: z.string().describe('Domain name'),
        protocol: z.string().describe('Protocol name (e.g. "direct", "playwright")'),
      },
    },
    async ({ domain, protocol }) => {
      const result = describeAdapterStructureHandler(domain, protocol)
      if (!result) {
        return { content: [{ type: 'text', text: `No adapter found for domain "${domain}" with protocol "${protocol}"` }] }
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  )
}
```

**Step 6: Verify build**

Run: `cd packages/mcp-server && npx tsup`
Expected: Build succeeds.

**Step 7: Commit**

```bash
git add packages/mcp-server/
git commit -m "feat: add scaffolding MCP tools (describe_domain_structure, describe_adapter_structure)"
```

---

## Task 7: Incremental Reporting Tool (get_run_diff)

**Files:**
- Create: `packages/mcp-server/src/tools/reporting.ts`
- Modify: `packages/mcp-server/src/tools/index.ts`
- Test: `packages/mcp-server/test/tools/reporting.spec.ts`

**Step 1: Write the failing test**

```ts
// packages/mcp-server/test/tools/reporting.spec.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RunStore } from '../../src/runs'
import { getRunDiffHandler } from '../../src/tools/reporting'

describe('get_run_diff handler', () => {
  let dir: string
  let store: RunStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aver-diff-'))
    store = new RunStore(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns null when fewer than 2 runs exist', () => {
    expect(getRunDiffHandler(store)).toBeNull()
    store.save({ timestamp: '2026-02-08T14:00:00.000Z', results: [] })
    expect(getRunDiffHandler(store)).toBeNull()
  })

  it('diffs two runs correctly', () => {
    store.save({
      timestamp: '2026-02-08T14:00:00.000Z',
      results: [
        { testName: 'test-a', domain: 'Cart', status: 'pass', trace: [] },
        { testName: 'test-b', domain: 'Cart', status: 'fail', trace: [] },
        { testName: 'test-c', domain: 'Cart', status: 'fail', trace: [] },
      ],
    })
    store.save({
      timestamp: '2026-02-08T14:30:00.000Z',
      results: [
        { testName: 'test-a', domain: 'Cart', status: 'fail', trace: [] },
        { testName: 'test-b', domain: 'Cart', status: 'pass', trace: [] },
        { testName: 'test-c', domain: 'Cart', status: 'fail', trace: [] },
        { testName: 'test-d', domain: 'Cart', status: 'pass', trace: [] },
      ],
    })

    const diff = getRunDiffHandler(store)!
    expect(diff.previousRun).toBe('2026-02-08T14:00:00.000Z')
    expect(diff.currentRun).toBe('2026-02-08T14:30:00.000Z')
    expect(diff.newlyFailing).toEqual(['test-a'])
    expect(diff.newlyPassing).toEqual(['test-b'])
    expect(diff.stillFailing).toEqual(['test-c'])
    expect(diff.stillPassing).toBe(1) // test-d is new and passing, counts as stillPassing
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run test/tools/reporting.spec.ts`
Expected: FAIL — cannot resolve modules

**Step 3: Write the reporting handler**

```ts
// packages/mcp-server/src/tools/reporting.ts
import type { RunStore } from '../runs.js'

export interface RunDiff {
  previousRun: string
  currentRun: string
  newlyFailing: string[]
  newlyPassing: string[]
  stillFailing: string[]
  stillPassing: number
}

export function getRunDiffHandler(store: RunStore): RunDiff | null {
  const [prev, curr] = store.getLastTwo()
  if (!prev || !curr) return null

  const prevStatuses = new Map<string, string>()
  for (const r of prev.results) {
    prevStatuses.set(r.testName, r.status)
  }

  const newlyFailing: string[] = []
  const newlyPassing: string[] = []
  const stillFailing: string[] = []
  let stillPassing = 0

  for (const r of curr.results) {
    const prevStatus = prevStatuses.get(r.testName)

    if (r.status === 'fail') {
      if (prevStatus === 'fail') {
        stillFailing.push(r.testName)
      } else {
        // was passing or new — now failing
        newlyFailing.push(r.testName)
      }
    } else if (r.status === 'pass') {
      if (prevStatus === 'fail') {
        newlyPassing.push(r.testName)
      } else {
        stillPassing++
      }
    }
  }

  return {
    previousRun: prev.timestamp,
    currentRun: curr.timestamp,
    newlyFailing,
    newlyPassing,
    stillFailing,
    stillPassing,
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/mcp-server && npx vitest run test/tools/reporting.spec.ts`
Expected: All tests PASS.

**Step 5: Register the reporting tool**

Add to `packages/mcp-server/src/tools/index.ts` — add `registerReportingTools(server, store)` call in `registerTools()`, and add the function:

```ts
import { getRunDiffHandler } from './reporting.js'

// In registerTools():
registerReportingTools(server, store)

// New function:
function registerReportingTools(server: McpServer, store: RunStore): void {
  server.registerTool(
    'get_run_diff',
    {
      description: 'Compare the two most recent test runs and return what changed: newly failing, newly passing, still failing, and count of still passing',
    },
    async () => {
      const diff = getRunDiffHandler(store)
      if (!diff) {
        return { content: [{ type: 'text', text: 'Need at least 2 test runs to compare. Run tests first.' }] }
      }
      return { content: [{ type: 'text', text: JSON.stringify(diff, null, 2) }] }
    },
  )
}
```

**Step 6: Verify build**

Run: `cd packages/mcp-server && npx tsup`
Expected: Build succeeds.

**Step 7: Commit**

```bash
git add packages/mcp-server/
git commit -m "feat: add incremental reporting MCP tool (get_run_diff)"
```

---

## Task 8: Full Test Suite + Build Verification

**Step 1: Run all MCP server tests**

Run: `cd packages/mcp-server && npx vitest run`
Expected: All tests PASS.

**Step 2: Run all tests across all packages**

Run: `npm test --workspaces`
Expected: All tests PASS across aver, protocol-playwright, and mcp-server.

**Step 3: Typecheck**

Run: `npx tsc --noEmit -p packages/mcp-server/tsconfig.json`
Expected: No errors.

**Step 4: Build all packages**

Run: `npm run build --workspaces`
Expected: Build succeeds for all packages.

**Step 5: Verify MCP server binary runs**

Run: `node packages/mcp-server/dist/index.js --help 2>&1 || true`
Expected: Server starts and prints "no config file found" to stderr (since no aver.config.ts in cwd), then waits for stdio input. Kill with Ctrl+C.

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: all MCP server tests pass, build clean"
```

---

## Summary

| # | Task | What |
|---|------|------|
| 0 | Registry `_getAdapters()` | Add enumeration function to core registry |
| 1 | Package scaffolding | `packages/mcp-server` with tsup, vitest, MCP SDK |
| 2 | Config + bootstrap | Config discovery, McpServer + StdioServerTransport |
| 3 | Domain exploration | `list_domains`, `get_domain_vocabulary`, `list_adapters` |
| 4 | Run persistence | `RunStore` class for `.aver/runs/` JSON files |
| 5 | Test execution | `run_tests`, `get_failure_details`, `get_test_trace` |
| 6 | Scaffolding | `describe_domain_structure`, `describe_adapter_structure` |
| 7 | Incremental reporting | `get_run_diff` |
| 8 | Build verification | Full test suite + build gate |
