# Approval Framework Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract the approval testing feature into `@aver/approvals`, add a generic capability-based extension system to core, and dogfood every approval behavior through aver acceptance tests.

**Architecture:** Core gets a generic `RunningTestContext` (AsyncLocalStorage) and `ProtocolExtensions` with typed capability contracts. The approval code moves to a new `packages/approvals` package that reads from extensions via `getTestContext()`. Protocols provide capabilities (e.g. `renderer:html`) without knowing about approvals.

**Tech Stack:** TypeScript 5.7+, Vitest, tsup (ESM/CJS+DTS), `diff` npm package (replaces hand-rolled LCS), `pngjs`/`pixelmatch` (move from protocol-playwright to approvals)

**Design doc:** `docs/plans/2026-02-12-approval-framework-design.md`

---

## Task 1: Add Generic Extensions and Test Context to Core

This is the prerequisite infrastructure. Core needs the extension system before the approvals package can consume it.

**Files:**
- Create: `packages/aver/src/core/extensions.ts`
- Create: `packages/aver/src/core/test-context.ts`
- Modify: `packages/aver/src/core/protocol.ts`
- Modify: `packages/aver/src/core/suite.ts`
- Modify: `packages/aver/src/index.ts`
- Create: `packages/aver/test/core/test-context.spec.ts`
- Create: `packages/aver/test/core/extensions.spec.ts`

### Step 1: Write failing test for `RunningTestContext`

```typescript
// packages/aver/test/core/test-context.spec.ts
import { describe, it, expect } from 'vitest'
import { runWithTestContext, getTestContext } from '../../src/core/test-context'

describe('RunningTestContext', () => {
  it('returns undefined outside a test context', () => {
    expect(getTestContext()).toBeUndefined()
  })

  it('provides context within runWithTestContext', async () => {
    const trace: any[] = []
    await runWithTestContext(
      {
        testName: 'my test',
        domainName: 'MyDomain',
        protocolName: 'unit',
        trace,
        extensions: {},
      },
      async () => {
        const ctx = getTestContext()
        expect(ctx).toBeDefined()
        expect(ctx!.testName).toBe('my test')
        expect(ctx!.domainName).toBe('MyDomain')
        expect(ctx!.protocolName).toBe('unit')
        expect(ctx!.trace).toBe(trace)
      },
    )
  })

  it('exposes protocol extensions', async () => {
    const mockRenderer = { render: async () => {} }
    await runWithTestContext(
      {
        testName: 'test',
        domainName: 'D',
        protocolName: 'playwright',
        trace: [],
        extensions: { 'renderer:html': mockRenderer },
      },
      async () => {
        const ctx = getTestContext()
        expect(ctx!.extensions['renderer:html']).toBe(mockRenderer)
      },
    )
  })

  it('returns undefined after context exits', async () => {
    await runWithTestContext(
      { testName: 't', domainName: 'd', protocolName: 'p', trace: [], extensions: {} },
      async () => {},
    )
    expect(getTestContext()).toBeUndefined()
  })
})
```

### Step 2: Run test to verify it fails

Run: `npx vitest run packages/aver/test/core/test-context.spec.ts`
Expected: FAIL — module `../../src/core/test-context` does not exist

### Step 3: Implement `core/extensions.ts`

```typescript
// packages/aver/src/core/extensions.ts
export interface HtmlRenderer {
  render(html: string, outputPath: string): Promise<void>
}

export interface ProtocolExtensions {
  'renderer:html'?: HtmlRenderer
  [key: string]: unknown
}
```

### Step 4: Implement `core/test-context.ts`

```typescript
// packages/aver/src/core/test-context.ts
import { AsyncLocalStorage } from 'node:async_hooks'
import type { TraceEntry } from './trace'
import type { ProtocolExtensions } from './extensions'

export interface RunningTestContext {
  testName: string
  domainName: string
  protocolName: string
  trace: TraceEntry[]
  extensions: ProtocolExtensions
}

const storage = new AsyncLocalStorage<RunningTestContext>()

export function runWithTestContext<T>(
  ctx: RunningTestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(ctx, fn)
}

export function getTestContext(): RunningTestContext | undefined {
  return storage.getStore()
}
```

### Step 5: Run test to verify it passes

Run: `npx vitest run packages/aver/test/core/test-context.spec.ts`
Expected: PASS (all 4 tests)

### Step 6: Update `core/protocol.ts`

Remove `ApprovalArtifactProvider` and `SerializerName` import. Add `extensions` to `Protocol`. Keep `TestMetadata`, `TestCompletion`, `TestFailureResult` unchanged.

```typescript
// packages/aver/src/core/protocol.ts
import type { TraceEntry, TraceAttachment } from './trace'
import type { ProtocolExtensions } from './extensions'

export interface TestMetadata {
  testName: string
  domainName: string
  adapterName: string
  protocolName: string
}

export interface TestCompletion extends TestMetadata {
  status: 'pass' | 'fail'
  trace: TraceEntry[]
  error?: unknown
}

export type TestFailureResult = void | TraceAttachment[] | { attachments?: TraceAttachment[] }

export interface Protocol<Context> {
  readonly name: string
  setup(): Promise<Context>
  teardown(ctx: Context): Promise<void>
  onTestStart?(ctx: Context, meta: TestMetadata): Promise<void> | void
  onTestFail?(ctx: Context, meta: TestCompletion): Promise<TestFailureResult> | TestFailureResult
  onTestEnd?(ctx: Context, meta: TestCompletion): Promise<void> | void
  extensions?: ProtocolExtensions
}
```

### Step 7: Update `core/suite.ts`

Replace `import { runWithApprovalContext } from '../approvals/context'` with `import { runWithTestContext } from './test-context'`.

In `runTestWithAdapter()`, replace the `runWithApprovalContext` call (lines 270-278) with:

```typescript
await runWithTestContext(
  {
    testName,
    domainName: domain.name,
    protocolName: adapter.protocol.name,
    trace,
    extensions: adapter.protocol.extensions ?? {},
  },
  async () => fn({ act: proxies.act, query: proxies.query, assert: proxies.assert, trace: () => [...trace] }),
)
```

### Step 8: Update `index.ts` exports

Remove: `export { approve } from './approvals/approve'`

Add:
```typescript
export { getTestContext } from './core/test-context'
export type { RunningTestContext } from './core/test-context'
export type { ProtocolExtensions, HtmlRenderer } from './core/extensions'
```

Keep `Protocol` type export (it now uses `ProtocolExtensions` instead of `ApprovalArtifactProvider`).

### Step 9: Run all core tests

Run: `npx vitest run --config packages/aver/vitest.config.ts --exclude 'examples/**' --exclude 'packages/protocol-playwright/**'`
Expected: All existing core tests PASS (the approval unit tests in `packages/aver/test/core/approvals.spec.ts` will FAIL because the source moved — that's expected and we'll handle it in Task 3)

**Note:** The approval tests in `packages/aver/test/core/approvals.spec.ts` will break because they import from `../../src/approvals/approve`. This is expected — we're about to move that code. Delete the file now; the acceptance tests in the new package will replace it with better coverage.

### Step 10: Commit

```bash
git add packages/aver/src/core/extensions.ts packages/aver/src/core/test-context.ts \
  packages/aver/src/core/protocol.ts packages/aver/src/core/suite.ts \
  packages/aver/src/index.ts packages/aver/test/core/test-context.spec.ts
git rm packages/aver/test/core/approvals.spec.ts
git commit -m "feat: add generic extension system and test context to core

Replace approval-specific ApprovalArtifactProvider and runWithApprovalContext
with generic ProtocolExtensions and RunningTestContext. Protocols declare
capabilities via extensions; plugins read them via getTestContext()."
```

---

## Task 2: Scaffold `packages/approvals`

Bare-minimum package structure so we can start writing acceptance tests.

**Files:**
- Create: `packages/approvals/package.json`
- Create: `packages/approvals/tsconfig.json`
- Create: `packages/approvals/tsup.config.ts`
- Create: `packages/approvals/vitest.config.ts`
- Create: `packages/approvals/src/index.ts`
- Create: `packages/approvals/src/types.ts`

### Step 1: Create `packages/approvals/package.json`

```json
{
  "name": "@aver/approvals",
  "version": "0.1.0",
  "description": "Approval testing for Aver",
  "type": "module",
  "license": "MIT",
  "engines": {
    "node": ">=18.0.0"
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "aver": "*"
  },
  "dependencies": {
    "diff": "^7.0.0"
  },
  "devDependencies": {
    "aver": "*",
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "@types/diff": "^6.0.0",
    "pngjs": "^7.0.0",
    "pixelmatch": "^5.3.0",
    "@types/pngjs": "^6.0.5",
    "@types/pixelmatch": "^5.2.6"
  }
}
```

### Step 2: Create `packages/approvals/tsconfig.json`

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

### Step 3: Create `packages/approvals/tsup.config.ts`

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['aver'],
})
```

### Step 4: Create `packages/approvals/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
  },
})
```

### Step 5: Create `packages/approvals/src/types.ts`

Minimal types — just enough for the acceptance domain to reference:

```typescript
export type SerializerName = 'json' | 'text' | 'html'

export interface ApproveOptions {
  name?: string
  serializer?: SerializerName
  fileExtension?: string
  normalize?: (value: string) => string
  compare?: (approved: string, received: string) => { equal: boolean; diff?: string } | boolean
  filePath?: string
  testName?: string
}
```

### Step 6: Create `packages/approvals/src/index.ts`

```typescript
export type { ApproveOptions, SerializerName } from './types'

// approve() will be added after acceptance tests drive the implementation
```

### Step 7: Run `npm install` to link the new workspace

Run: `npm install`
Expected: `@aver/approvals` linked in the workspace. No errors.

### Step 8: Commit

```bash
git add packages/approvals/
git commit -m "chore: scaffold @aver/approvals package

Bare-minimum package structure with types. Implementation will be
driven by acceptance tests in subsequent tasks."
```

---

## Task 3: Move Existing Approval Code into New Package

Move the working code from core into the new package as a baseline. We'll refactor later under test coverage.

**Files:**
- Move: `packages/aver/src/approvals/approve.ts` → `packages/approvals/src/approve.ts`
- Move: `packages/aver/src/approvals/serializers.ts` → `packages/approvals/src/serializers.ts`
- Move: `packages/aver/src/approvals/diff.ts` → `packages/approvals/src/diff.ts`
- Delete: `packages/aver/src/approvals/context.ts` (replaced by core's test-context.ts)
- Delete: `packages/aver/src/approvals/` directory from core
- Modify: `packages/approvals/src/approve.ts` (update imports)
- Modify: `packages/approvals/src/index.ts`

### Step 1: Copy the source files

Copy `approve.ts`, `serializers.ts`, `diff.ts` from `packages/aver/src/approvals/` to `packages/approvals/src/`.

### Step 2: Update imports in `approve.ts`

Replace:
```typescript
import { addApprovalAttachments, getApprovalContext } from './context'
```
With:
```typescript
import { getTestContext } from 'aver'
import type { RunningTestContext, HtmlRenderer } from 'aver'
```

Update the `approve()` function to read from `getTestContext()` instead of `getApprovalContext()`:
- Replace `const context = getApprovalContext()` with `const context = getTestContext()`
- Replace `const provider = context?.approvalArtifacts` with discovery via extensions:
  ```typescript
  const renderer = context?.extensions['renderer:html'] as HtmlRenderer | undefined
  ```
- Replace all provider calls with renderer calls (the renderer just has `render(html, outputPath)`)
- Replace `addApprovalAttachments(...)` with direct trace push via `context?.trace.push(...)`

This is the most involved step — the `approve()` function needs to work with the new generic interfaces. The provider's `canHandle`/`render`/`diff` pattern becomes:
- Check if `renderer` exists and serializer is `'html'`
- Call `renderer.render(html, outputPath)` for each side
- Image diffing with pngjs/pixelmatch happens inside `approve.ts` (moved from protocol-playwright)

### Step 3: Update `packages/approvals/src/index.ts`

```typescript
export { approve } from './approve'
export type { ApproveOptions, SerializerName } from './types'
```

### Step 4: Delete approval code from core

Delete `packages/aver/src/approvals/` directory entirely (approve.ts, context.ts, diff.ts, serializers.ts).

Remove the CLI approve import if it references the old path (check `packages/aver/src/cli/approve.ts` — it imports from `./run`, not from the approvals module, so it should be fine, but verify).

### Step 5: Run a quick smoke test

Run: `npx vitest run --config packages/aver/vitest.config.ts --exclude 'examples/**' --exclude 'packages/protocol-playwright/**'`
Expected: Core tests pass (no more approval imports from core). The new package has no tests yet.

### Step 6: Commit

```bash
git add packages/approvals/src/ packages/aver/src/
git rm -r packages/aver/src/approvals/
git commit -m "refactor: move approval code from core to @aver/approvals

Core is now approval-free. The approve() function reads from the
generic test context and extension system instead of the
approval-specific context."
```

---

## Task 4: Define the `aver-approvals` Acceptance Domain

This is where the BDD dogfooding starts. We define the vocabulary for testing the approval framework through aver's own domain-driven approach.

**Files:**
- Create: `packages/approvals/test/acceptance/domains/aver-approvals.ts`

### Step 1: Define the domain

```typescript
// packages/approvals/test/acceptance/domains/aver-approvals.ts
import { defineDomain, action, query, assertion } from 'aver'

export const averApprovals = defineDomain({
  name: 'AverApprovals',
  actions: {
    approveValue: action<{
      value: unknown
      name?: string
      serializer?: 'json' | 'text' | 'html'
    }>(),
    approveWithCustomCompare: action<{
      value: unknown
      compareFn: 'alwaysEqual' | 'alwaysDifferent'
    }>(),
    approveWithNormalize: action<{
      value: unknown
      normalizeFn: 'lowercase' | 'trimLines'
    }>(),
    setApproveMode: action(),
    clearApproveMode: action(),
  },
  queries: {
    approvedFileExists: query<boolean>(),
    receivedFileContents: query<string>(),
    diffFileContents: query<string>(),
    traceAttachments: query<Array<{ name: string; path: string }>>(),
    lastError: query<string | undefined>(),
  },
  assertions: {
    baselineCreated: assertion(),
    baselineMissing: assertion(),
    mismatchDetected: assertion(),
    matchPassed: assertion(),
    diffContains: assertion<{ text: string }>(),
    attachmentsRecorded: assertion<{ minCount: number }>(),
    traceEntryHasStatus: assertion<{ name: string; status: 'pass' | 'fail' }>(),
    noError: assertion(),
  },
})
```

### Step 2: Commit

```bash
git add packages/approvals/test/acceptance/domains/aver-approvals.ts
git commit -m "feat: define aver-approvals acceptance domain

Domain vocabulary for testing approval framework behaviors through
aver's own BDD approach."
```

---

## Task 5: Write Acceptance Tests (Failing)

Write all acceptance test scenarios. They will fail because the adapter doesn't exist yet. This is the BDD "red" phase — the tests define the desired behavior.

**Files:**
- Create: `packages/approvals/test/acceptance/approval-testing.spec.ts`

### Step 1: Write the test file

```typescript
// packages/approvals/test/acceptance/approval-testing.spec.ts
import { describe, beforeEach } from 'vitest'
import { suite } from 'aver'
import { resetRegistry } from 'aver'
import { averApprovals } from './domains/aver-approvals'
import { averApprovalsAdapter } from './adapters/aver-approvals.unit'

describe('Approval testing', () => {
  const { test } = suite(averApprovals, averApprovalsAdapter)

  describe('baseline management', () => {
    test('fails when baseline is missing', async ({ act, assert }) => {
      await act.approveValue({ value: { count: 1 } })
      await assert.mismatchDetected()
      await assert.baselineMissing()
      await assert.diffContains({ text: 'Baseline missing' })
    })

    test('creates baseline when approve mode is on', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: { count: 2 } })
      await assert.noError()
      await assert.baselineCreated()
    })

    test('passes when approved matches received', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: { count: 3 } })
      await act.clearApproveMode()
      await act.approveValue({ value: { count: 3 } })
      await assert.matchPassed()
      await assert.noError()
    })
  })

  describe('mismatch detection', () => {
    test('detects mismatch and generates diff', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: { count: 5 } })
      await act.clearApproveMode()
      await act.approveValue({ value: { count: 99 } })
      await assert.mismatchDetected()
      await assert.diffContains({ text: '+' })
      await assert.diffContains({ text: '-' })
    })

    test('updates baseline when approve mode is on after mismatch', async ({ act, query, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: { old: true } })
      await act.approveValue({ value: { new: true } })
      await assert.noError()
      await assert.baselineCreated()
      const contents = await query.receivedFileContents()
      await assert.diffContains({ text: 'new' })
    })
  })

  describe('custom comparison', () => {
    test('uses custom compare function', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: 'hello' })
      await act.clearApproveMode()
      await act.approveWithCustomCompare({ value: 'different', compareFn: 'alwaysEqual' })
      await assert.matchPassed()
      await assert.noError()
    })

    test('applies normalize before comparison', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: 'HELLO WORLD', serializer: 'text' })
      await act.clearApproveMode()
      await act.approveWithNormalize({ value: 'hello world', normalizeFn: 'lowercase' })
      await assert.matchPassed()
      await assert.noError()
    })
  })

  describe('multiple approvals in one test', () => {
    test('handles multiple named approvals independently', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: 'first', name: 'alpha', serializer: 'text' })
      await act.approveValue({ value: 'second', name: 'beta', serializer: 'text' })
      await assert.noError()
      await assert.baselineCreated()
    })
  })

  describe('trace integration', () => {
    test('records attachments on approval failure', async ({ act, query, assert }) => {
      await act.approveValue({ value: { data: 1 } })
      await assert.mismatchDetected()
      await assert.attachmentsRecorded({ minCount: 2 })
    })

    test('records pass status when baseline created', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: { data: 2 } })
      await assert.traceEntryHasStatus({ name: 'approval-artifacts', status: 'pass' })
    })

    test('records fail status on mismatch', async ({ act, assert }) => {
      await act.approveValue({ value: { data: 3 } })
      await assert.traceEntryHasStatus({ name: 'approval-artifacts', status: 'fail' })
    })
  })

  describe('renderer extension integration', () => {
    test('works without renderer (text diff only)', async ({ act, assert }) => {
      await act.approveValue({ value: '<html>hi</html>', serializer: 'html' })
      await assert.mismatchDetected()
      await assert.diffContains({ text: 'Baseline missing' })
    })
  })

  describe('serializers', () => {
    test('auto-detects json for objects', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: { key: 'val' } })
      await assert.noError()
      await assert.baselineCreated()
    })

    test('auto-detects text for strings', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: 'plain text' })
      await assert.noError()
      await assert.baselineCreated()
    })
  })
})
```

### Step 2: Run tests to verify they fail

Run: `npx vitest run packages/approvals/test/acceptance/approval-testing.spec.ts`
Expected: FAIL — `./adapters/aver-approvals.unit` does not exist

### Step 3: Commit

```bash
git add packages/approvals/test/acceptance/approval-testing.spec.ts
git commit -m "test: add failing acceptance tests for approval framework

12 BDD scenarios covering: baseline management, mismatch detection,
custom compare/normalize, multi-approval, trace integration,
renderer extensions, and serializer auto-detection.

All tests fail — adapter implementation follows."
```

---

## Task 6: Implement the Acceptance Adapter

This is the "green" phase. Each adapter handler exercises the real `approve()` function. The adapter is a thin wrapper that translates domain vocabulary into `approve()` calls.

**Files:**
- Create: `packages/approvals/test/acceptance/adapters/aver-approvals.unit.ts`

### Step 1: Implement the adapter

The adapter needs a session that tracks state across actions in a single test: a temp directory for approval files, the last error, and whether approve mode is on.

```typescript
// packages/approvals/test/acceptance/adapters/aver-approvals.unit.ts
import { expect } from 'vitest'
import { implement, unit } from 'aver'
import type { TraceEntry } from 'aver'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { approve } from '../../../src/approve'
import { averApprovals } from '../domains/aver-approvals'

interface ApprovalSession {
  workDir: string
  lastError?: Error
  lastApprovalName: string
  trace: TraceEntry[]
}

export const averApprovalsAdapter = implement(averApprovals, {
  protocol: unit<ApprovalSession>(() => {
    const workDir = mkdtempSync(join(tmpdir(), 'aver-approvals-test-'))
    return { workDir, lastApprovalName: 'approval', trace: [] }
  }),

  actions: {
    approveValue: async (session, { value, name, serializer }) => {
      session.lastError = undefined
      session.lastApprovalName = name ?? 'approval'
      try {
        await approve(value, {
          name,
          serializer,
          filePath: join(session.workDir, 'tests', 'test.spec.ts'),
          testName: 'approval-test',
        })
      } catch (e: any) {
        session.lastError = e
      }
    },

    approveWithCustomCompare: async (session, { value, compareFn }) => {
      session.lastError = undefined
      const comparators = {
        alwaysEqual: () => ({ equal: true }),
        alwaysDifferent: () => ({ equal: false, diff: 'custom diff' }),
      }
      try {
        await approve(value, {
          compare: comparators[compareFn],
          filePath: join(session.workDir, 'tests', 'test.spec.ts'),
          testName: 'approval-test',
        })
      } catch (e: any) {
        session.lastError = e
      }
    },

    approveWithNormalize: async (session, { value, normalizeFn }) => {
      session.lastError = undefined
      const normalizers = {
        lowercase: (s: string) => s.toLowerCase(),
        trimLines: (s: string) => s.split('\n').map(l => l.trim()).join('\n'),
      }
      try {
        await approve(value, {
          normalize: normalizers[normalizeFn],
          serializer: 'text',
          filePath: join(session.workDir, 'tests', 'test.spec.ts'),
          testName: 'approval-test',
        })
      } catch (e: any) {
        session.lastError = e
      }
    },

    setApproveMode: async () => {
      process.env.AVER_APPROVE = '1'
    },

    clearApproveMode: async () => {
      delete process.env.AVER_APPROVE
    },
  },

  queries: {
    approvedFileExists: async (session) => {
      const dir = join(session.workDir, 'tests', '__approvals__', 'approval-test')
      const approvedJson = join(dir, `${safeName(session.lastApprovalName)}.approved.json`)
      const approvedTxt = join(dir, `${safeName(session.lastApprovalName)}.approved.txt`)
      const approvedHtml = join(dir, `${safeName(session.lastApprovalName)}.approved.html`)
      return existsSync(approvedJson) || existsSync(approvedTxt) || existsSync(approvedHtml)
    },

    receivedFileContents: async (session) => {
      const dir = join(session.workDir, 'tests', '__approvals__', 'approval-test')
      for (const ext of ['json', 'txt', 'html']) {
        const path = join(dir, `${safeName(session.lastApprovalName)}.received.${ext}`)
        if (existsSync(path)) return readFileSync(path, 'utf-8')
      }
      return ''
    },

    diffFileContents: async (session) => {
      const dir = join(session.workDir, 'tests', '__approvals__', 'approval-test')
      const path = join(dir, `${safeName(session.lastApprovalName)}.diff.txt`)
      return existsSync(path) ? readFileSync(path, 'utf-8') : ''
    },

    traceAttachments: async (session) => {
      const ctx = session as any
      // Read from the running test context's trace
      const trace = session.trace ?? []
      const entries = trace.filter(
        (e: TraceEntry) => e.kind === 'test' && e.attachments && e.attachments.length > 0,
      )
      return entries.flatMap((e: TraceEntry) =>
        (e.attachments ?? []).map(a => ({ name: a.name, path: a.path })),
      )
    },

    lastError: async (session) => {
      return session.lastError?.message
    },
  },

  assertions: {
    baselineCreated: async (session) => {
      const dir = join(session.workDir, 'tests', '__approvals__', 'approval-test')
      let found = false
      for (const ext of ['json', 'txt', 'html']) {
        if (existsSync(join(dir, `${safeName(session.lastApprovalName)}.approved.${ext}`))) {
          found = true
          break
        }
      }
      expect(found).toBe(true)
    },

    baselineMissing: async (session) => {
      expect(session.lastError?.message).toContain('Approval baseline missing')
    },

    mismatchDetected: async (session) => {
      expect(session.lastError).toBeDefined()
    },

    matchPassed: async (session) => {
      expect(session.lastError).toBeUndefined()
    },

    diffContains: async (session, { text }) => {
      const dir = join(session.workDir, 'tests', '__approvals__', 'approval-test')
      const path = join(dir, `${safeName(session.lastApprovalName)}.diff.txt`)
      if (existsSync(path)) {
        const contents = readFileSync(path, 'utf-8')
        expect(contents).toContain(text)
        return
      }
      // Check error message for the text
      expect(session.lastError?.message ?? '').toContain(text)
    },

    attachmentsRecorded: async (session) => {
      // This will need integration with the test context trace
      // For now, check that approval files exist as proxy for attachments
      const dir = join(session.workDir, 'tests', '__approvals__', 'approval-test')
      const received = existsSync(join(dir, `${safeName(session.lastApprovalName)}.received.json`))
      const diff = existsSync(join(dir, `${safeName(session.lastApprovalName)}.diff.txt`))
      expect(received || diff).toBe(true)
    },

    traceEntryHasStatus: async (session, { name, status }) => {
      // Will be refined when trace integration is wired
      // For now, validate the error state matches expected status
      if (status === 'fail') {
        expect(session.lastError).toBeDefined()
      } else {
        expect(session.lastError).toBeUndefined()
      }
    },

    noError: async (session) => {
      expect(session.lastError).toBeUndefined()
    },
  },
})

function safeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'approval'
}
```

**Note:** The `traceAttachments` query and `traceEntryHasStatus`/`attachmentsRecorded` assertions use simplified checks initially. They'll be refined in Task 7 when we wire up proper trace integration with `getTestContext()`.

### Step 2: Run acceptance tests

Run: `npx vitest run packages/approvals/test/acceptance/approval-testing.spec.ts`
Expected: Tests start running. Some may pass, some may fail depending on how `approve()` behaves with the new imports. Debug and fix until **all 12 acceptance tests pass**.

### Step 3: Run all tests

Run: `npx vitest run --config packages/aver/vitest.config.ts --exclude 'examples/**' --exclude 'packages/protocol-playwright/**'`
Expected: All core + new acceptance tests pass.

### Step 4: Commit

```bash
git add packages/approvals/test/acceptance/adapters/aver-approvals.unit.ts
git commit -m "feat: implement aver-approvals acceptance adapter

All 12 acceptance tests pass. The adapter exercises the real approve()
function through aver's domain-driven test pattern."
```

---

## Task 7: Fix Trace Integration and Status Bug

The acceptance tests for trace integration need real `getTestContext()` wiring. Also fix the `status: 'fail'` bug for successful approvals.

**Files:**
- Modify: `packages/approvals/src/approve.ts`
- Modify: `packages/approvals/test/acceptance/adapters/aver-approvals.unit.ts`

### Step 1: Update `approve()` to push trace entries with correct status

Find all places where trace entries are pushed. When `AVER_APPROVE=1` succeeds (creates or updates a baseline), set `status: 'pass'`. When approval fails (missing baseline or mismatch), set `status: 'fail'`.

The key change in `approve.ts` — replace the hard-coded `status: 'fail'` with a parameter:

```typescript
function pushAttachments(
  trace: TraceEntry[] | undefined,
  attachments: TraceAttachment[],
  status: 'pass' | 'fail',
): void {
  if (!trace || attachments.length === 0) return
  trace.push({
    kind: 'test',
    name: 'approval-artifacts',
    payload: undefined,
    status,
    attachments,
  })
}
```

Call with `status: 'pass'` on success paths, `status: 'fail'` on failure paths.

### Step 2: Update the adapter to read trace from `getTestContext()`

The adapter's `traceEntryHasStatus` assertion should read the actual trace. Since `approve()` is called within the adapter (which runs inside `runWithTestContext` via the suite), the trace entries are available.

Update the adapter to capture trace entries by wrapping approve calls within a context that shares the trace.

### Step 3: Run acceptance tests

Run: `npx vitest run packages/approvals/test/acceptance/approval-testing.spec.ts`
Expected: All tests pass, including the trace integration tests.

### Step 4: Commit

```bash
git add packages/approvals/src/approve.ts packages/approvals/test/acceptance/
git commit -m "fix: correct trace entry status for successful approvals

Status is 'pass' when AVER_APPROVE=1 creates/updates a baseline,
'fail' when approval fails. Trace integration tested via acceptance
domain."
```

---

## Task 8: Replace LCS Diff with `diff` Library

Swap the hand-rolled LCS algorithm for the `diff` npm package.

**Files:**
- Delete: `packages/approvals/src/diff.ts`
- Create: `packages/approvals/src/compare.ts`
- Modify: `packages/approvals/src/approve.ts` (update import)

### Step 1: Run acceptance tests to confirm green baseline

Run: `npx vitest run packages/approvals/test/acceptance/approval-testing.spec.ts`
Expected: All pass.

### Step 2: Create `packages/approvals/src/compare.ts`

```typescript
// packages/approvals/src/compare.ts
import { createTwoFilesPatch } from 'diff'
import type { ApproveOptions } from './types'

export interface ComparisonResult {
  equal: boolean
  diff?: string
}

export function compareValues(
  approved: string,
  received: string,
  compare?: ApproveOptions['compare'],
): ComparisonResult {
  if (!compare) return { equal: approved === received }
  const result = compare(approved, received)
  if (typeof result === 'boolean') return { equal: result }
  return { equal: result.equal, diff: result.diff }
}

export function generateDiff(approved: string, received: string): string {
  return createTwoFilesPatch('approved', 'received', approved, received, '', '', {
    context: 3,
  })
}
```

### Step 3: Update `approve.ts` to use `compare.ts`

Replace `import { diffText } from './diff'` with `import { compareValues, generateDiff } from './compare'`.

Replace the inline `compareValues` function and `diffText` call with the new imports.

### Step 4: Delete `packages/approvals/src/diff.ts`

### Step 5: Run acceptance tests

Run: `npx vitest run packages/approvals/test/acceptance/approval-testing.spec.ts`
Expected: All pass. Diff output now has proper unified format with context lines and hunk headers.

### Step 6: Commit

```bash
git rm packages/approvals/src/diff.ts
git add packages/approvals/src/compare.ts packages/approvals/src/approve.ts
git commit -m "refactor: replace LCS diff with 'diff' library

Unified diff output with context lines and hunk headers. Fixes O(n*m)
memory issue with the hand-rolled LCS implementation."
```

---

## Task 9: Decompose `approve()` into Pipeline

Refactor the monolithic `approve()` into focused modules. This is a pure refactoring task — all acceptance tests must stay green throughout.

**Files:**
- Create: `packages/approvals/src/paths.ts`
- Create: `packages/approvals/src/artifacts.ts`
- Modify: `packages/approvals/src/approve.ts`
- Modify: `packages/approvals/src/serializers.ts`

### Step 1: Run acceptance tests to confirm green baseline

Run: `npx vitest run packages/approvals/test/acceptance/approval-testing.spec.ts`
Expected: All pass.

### Step 2: Extract `paths.ts`

```typescript
// packages/approvals/src/paths.ts
import { join, dirname } from 'node:path'

export interface ApprovalPaths {
  approvalDir: string
  approvedPath: string
  receivedPath: string
  diffPath: string
  approvedImagePath: string
  receivedImagePath: string
  diffImagePath: string
}

export function resolveApprovalPaths(
  testPath: string,
  testName: string,
  approvalName: string,
  extension: string,
): ApprovalPaths {
  const approvalDir = join(dirname(testPath), '__approvals__', safeName(testName))
  const name = safeName(approvalName)
  return {
    approvalDir,
    approvedPath: join(approvalDir, `${name}.approved.${extension}`),
    receivedPath: join(approvalDir, `${name}.received.${extension}`),
    diffPath: join(approvalDir, `${name}.diff.txt`),
    approvedImagePath: join(approvalDir, `${name}.approved.png`),
    receivedImagePath: join(approvalDir, `${name}.received.png`),
    diffImagePath: join(approvalDir, `${name}.diff.png`),
  }
}

export function safeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'approval'
}
```

### Step 3: Extract `artifacts.ts`

```typescript
// packages/approvals/src/artifacts.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { TraceAttachment, HtmlRenderer } from 'aver'
import type { ApprovalPaths } from './paths'

export async function renderAndDiff(
  renderer: HtmlRenderer | undefined,
  paths: ApprovalPaths,
  approved: string | undefined,
  received: string,
  isHtml: boolean,
): Promise<TraceAttachment[]> {
  const attachments: TraceAttachment[] = []
  if (!renderer || !isHtml) return attachments

  // Render approved if it exists but image doesn't
  if (approved && !existsSync(paths.approvedImagePath)) {
    try {
      await renderer.render(approved, paths.approvedImagePath)
      attachments.push({ name: 'approval-approved', path: paths.approvedImagePath, mime: 'image/png' })
    } catch {
      // Ignore render failures
    }
  }

  // Render received
  try {
    await renderer.render(received, paths.receivedImagePath)
    attachments.push({ name: 'approval-received', path: paths.receivedImagePath, mime: 'image/png' })
  } catch {
    // Ignore render failures
  }

  // Diff images if both exist
  if (existsSync(paths.approvedImagePath) && existsSync(paths.receivedImagePath)) {
    try {
      const diffAttachments = await diffImages(
        paths.approvedImagePath,
        paths.receivedImagePath,
        paths.diffImagePath,
      )
      attachments.push(...diffAttachments)
    } catch {
      // Ignore diff failures
    }
  }

  return attachments
}

async function diffImages(
  approvedPath: string,
  receivedPath: string,
  diffPath: string,
): Promise<TraceAttachment[]> {
  // Dynamic import — pngjs/pixelmatch are optional deps
  const { PNG } = await import('pngjs')
  const { default: pixelmatch } = await import('pixelmatch')

  const img1 = PNG.sync.read(readFileSync(approvedPath))
  const img2 = PNG.sync.read(readFileSync(receivedPath))
  const width = Math.max(img1.width, img2.width)
  const height = Math.max(img1.height, img2.height)
  const a = padImage(PNG, img1, width, height)
  const b = padImage(PNG, img2, width, height)
  const diff = new PNG({ width, height })
  pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1 })
  writeFileSync(diffPath, PNG.sync.write(diff))
  return [{ name: 'approval-diff', path: diffPath, mime: 'image/png' }]
}

function padImage(PNG: any, image: any, width: number, height: number): any {
  if (image.width === width && image.height === height) return image
  const padded = new PNG({ width, height })
  PNG.bitblt(image, padded, 0, 0, image.width, image.height, 0, 0)
  return padded
}
```

### Step 4: Rewrite `approve.ts` as orchestrator

The new `approve.ts` imports from `paths.ts`, `compare.ts`, `artifacts.ts`, `serializers.ts`. It should be under 80 lines — a clean orchestrator.

### Step 5: Run acceptance tests

Run: `npx vitest run packages/approvals/test/acceptance/approval-testing.spec.ts`
Expected: All pass. The refactoring preserved all behavior.

### Step 6: Commit

```bash
git add packages/approvals/src/
git commit -m "refactor: decompose approve() into focused pipeline modules

paths.ts: file path resolution
compare.ts: text comparison + diff generation
artifacts.ts: renderer discovery + image diffing
approve.ts: thin orchestrator (~80 lines, down from 237)"
```

---

## Task 10: Update Protocol-Playwright

Remove approval-specific code from playwright protocol. Add `renderer:html` extension. Clean up approval browser lifecycle.

**Files:**
- Modify: `packages/protocol-playwright/src/index.ts`
- Modify: `packages/protocol-playwright/package.json`

### Step 1: Update `packages/protocol-playwright/src/index.ts`

Remove: `approvalArtifacts` property, `pngjs`/`pixelmatch` imports and `padImage` function.

Add: `extensions` with `'renderer:html'` key. Add `approvalBrowser?.close()` to `teardown()`.

```typescript
import type { HtmlRenderer } from 'aver'

// In the returned protocol object:
extensions: {
  'renderer:html': {
    async render(html, outputPath) {
      if (!approvalBrowser) {
        const pw = await import('playwright')
        approvalBrowser = await pw.chromium.launch({ headless: true })
      }
      const page = await approvalBrowser.newPage()
      await page.setContent(html, { waitUntil: 'load' })
      await page.setViewportSize({ width: 1280, height: 720 })
      await page.screenshot({ path: outputPath, fullPage: true })
      await page.close()
    },
  } satisfies HtmlRenderer,
},

// In teardown:
async teardown(_ctx: Page): Promise<void> {
  await browser?.close()
  browser = undefined
  await approvalBrowser?.close()
  approvalBrowser = undefined
},
```

### Step 2: Update `packages/protocol-playwright/package.json`

Remove `pngjs`, `pixelmatch`, `@types/pngjs`, `@types/pixelmatch` from devDependencies.

### Step 3: Run playwright tests

Run: `npx vitest run packages/protocol-playwright/test/`
Expected: Existing playwright tests pass.

### Step 4: Commit

```bash
git add packages/protocol-playwright/
git commit -m "refactor: replace approvalArtifacts with renderer:html extension

Playwright protocol now provides a generic HTML rendering capability
via extensions. No knowledge of approval testing. pngjs/pixelmatch
moved to @aver/approvals."
```

---

## Task 11: Update Example App

Update the task-board example to import from `@aver/approvals`.

**Files:**
- Modify: `examples/task-board/tests/task-board.spec.ts`
- Modify: `examples/task-board/adapters/task-board.playwright.ts` (if it references approval types)

### Step 1: Update import

In `examples/task-board/tests/task-board.spec.ts`, change:
```typescript
import { suite, approve } from 'aver'
```
To:
```typescript
import { suite } from 'aver'
import { approve } from '@aver/approvals'
```

### Step 2: Run example tests (unit adapter only, to avoid needing playwright)

Run: `AVER_ADAPTER=unit npx vitest run examples/task-board/tests/task-board.spec.ts`
Expected: Core tests pass. Demo tests are skipped (they require env vars).

### Step 3: Commit

```bash
git add examples/task-board/
git commit -m "chore: update example app to import from @aver/approvals"
```

---

## Task 12: Delete Stale Approval Code from Core

Final cleanup. Remove any remaining references to the old approval system.

**Files:**
- Verify: `packages/aver/src/` has no approval imports
- Verify: `packages/aver/src/cli/approve.ts` still works (it sets AVER_APPROVE env var and delegates to vitest — doesn't import approval code directly)

### Step 1: Search for stale references

Search all files in `packages/aver/src/` for `approval`, `approve`, `serializer` (approval-related). Only `cli/approve.ts` should remain (it just sets an env var).

### Step 2: Run full test suite

Run: `npx vitest run --config packages/aver/vitest.config.ts --exclude 'examples/**' --exclude 'packages/protocol-playwright/**'`
Expected: All pass.

Run: `npx vitest run packages/approvals/`
Expected: All acceptance tests pass.

### Step 3: Commit (if any cleanup was needed)

```bash
git commit -m "chore: remove stale approval references from core"
```

---

## Task 13: Verify CLI Can Run Approval Tests

Quick exploration to confirm the `aver` CLI can run the suite.

### Step 1: Build core

Run: `npm run build -w packages/aver`

### Step 2: Build approvals

Run: `npm run build -w packages/approvals`

### Step 3: Try running via CLI

Run: `npx aver run packages/approvals/test/acceptance/approval-testing.spec.ts`

If it works, great. If not, note what needs fixing (likely path resolution or config loading) — the CLI fix is out of scope for this plan but should be tracked.

### Step 4: Commit any fixes or add a note

```bash
git commit -m "chore: verify CLI compatibility with approval tests"
```

---

## Summary

| Task | Description | Tests |
|------|-------------|-------|
| 1 | Core: extensions + test context | 4 unit tests |
| 2 | Scaffold `@aver/approvals` | — |
| 3 | Move existing code | Smoke test |
| 4 | Define acceptance domain | — |
| 5 | Write failing acceptance tests | 12 scenarios (red) |
| 6 | Implement acceptance adapter | 12 scenarios (green) |
| 7 | Fix trace status bug | Trace tests refined |
| 8 | Replace LCS with `diff` lib | Acceptance tests green |
| 9 | Decompose `approve()` | Acceptance tests green |
| 10 | Update protocol-playwright | Playwright tests green |
| 11 | Update example app | Example tests green |
| 12 | Delete stale code | Full suite green |
| 13 | CLI exploration | Manual check |
