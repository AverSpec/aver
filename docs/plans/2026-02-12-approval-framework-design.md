# Approval Framework Extraction & Polish

Design for extracting the approval testing feature into its own package, adding a generic extension system to core, and hardening the implementation for open-source release.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Refactor + harden | Fix bugs, decompose approve(), clean up provider interface, improve diff |
| Package split | Separate `@aver/approvals` | Keep core zero-dep. Users pick features they need. |
| Re-export from core | No | Avoids circular dependency. Matches protocol-playwright pattern. |
| Extension coupling | Capability-based | Protocols provide generic capabilities, plugins consume them. No direct coupling. |
| Capability ownership | Core owns contracts | Core defines well-known extension interfaces. Both sides import from core. |
| Type safety | `ProtocolExtensions` interface in core | Typed keys for known capabilities, `[key: string]: unknown` escape hatch for third-party. |
| Diff algorithm | Use a dependency | Replace hand-rolled LCS with a real diff library. Zero-dep purity isn't worth worse output. |
| Acceptance tests | New aver-approvals domain | Separate domain with its own adapter and specs. Dogfoods aver for the approval feature. |
| Provider auto-discovery | Via extensions + `getTestContext()` | `approve()` reads `renderer:html` from the running test's protocol extensions. |
| Playwright approval browser | Clean up in teardown | Fix resource leak — close `approvalBrowser` alongside main browser. |

## Architecture

```
aver (core)                    @aver/approvals              @aver/protocol-playwright
+--------------------------+   +-------------------------+  +------------------------+
| Domain, Adapter,         |   | approve()               |  | playwright()           |
| Suite, Protocol          |   | serializers, compare     |  | setup/teardown/hooks   |
|                          |<--| artifacts (image diff)   |  |                        |
| ProtocolExtensions       |   |                         |  | Implements:            |
|   'renderer:html'?       |-->| Reads 'renderer:html'   |  |   'renderer:html'      |
|   [key: string]: unknown |   | from getTestContext()    |  |   in extensions        |
|                          |   |                         |  |                        |
| RunningTestContext       |   | Deps: diff lib,         |  | No approval knowledge  |
| getTestContext()         |   |   pngjs, pixelmatch     |  | No approval deps       |
+--------------------------+   +-------------------------+  +------------------------+
       ^                              |                            |
       |   peer dep                   |                            |
       +------------------------------+----------------------------+
```

Both `@aver/approvals` and `@aver/protocol-playwright` depend on `aver` (core). Neither depends on the other. They communicate through the `ProtocolExtensions` capability contracts defined in core.

## Core Changes

### New: `core/extensions.ts`

Defines well-known capability contracts as interfaces:

```typescript
export interface HtmlRenderer {
  render(html: string, outputPath: string): Promise<void>
}

export interface ProtocolExtensions {
  'renderer:html'?: HtmlRenderer
  [key: string]: unknown
}
```

Third-party extensions use the index signature. They can augment `ProtocolExtensions` via declaration merging if they want typed keys.

### New: `core/test-context.ts`

Generic AsyncLocalStorage facility replacing the approval-specific one:

```typescript
export interface RunningTestContext {
  testName: string
  domainName: string
  protocolName: string
  trace: TraceEntry[]
  extensions: ProtocolExtensions
}

export function runWithTestContext<T>(
  ctx: RunningTestContext,
  fn: () => Promise<T>,
): Promise<T>

export function getTestContext(): RunningTestContext | undefined
```

### Changed: `core/protocol.ts`

```typescript
export interface Protocol<Context> {
  readonly name: string
  setup(): Promise<Context>
  teardown(ctx: Context): Promise<void>
  onTestStart?(ctx: Context, meta: TestMetadata): Promise<void> | void
  onTestFail?(ctx: Context, meta: TestCompletion): Promise<TestFailureResult> | TestFailureResult
  onTestEnd?(ctx: Context, meta: TestCompletion): Promise<void> | void
  extensions?: ProtocolExtensions                    // NEW: replaces approvalArtifacts
}
```

`ApprovalArtifactProvider` removed. `approvalArtifacts` removed.

### Changed: `core/suite.ts`

Replace `runWithApprovalContext(...)` with `runWithTestContext(...)`:

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

Remove import of `approvals/context`.

### Exports

**Added:** `getTestContext`, `RunningTestContext`, `ProtocolExtensions`, `HtmlRenderer`
**Removed:** `approve`, `ApprovalArtifactProvider`
**Deleted:** `src/approvals/` directory (entire thing moves to new package)

## New Package: `@aver/approvals`

### Structure

```
packages/approvals/
  src/
    index.ts              # barrel exports
    approve.ts            # orchestrator (decomposed)
    paths.ts              # approval directory + file path resolution
    compare.ts            # text comparison + diff generation (uses dep)
    artifacts.ts          # renderer discovery via extensions, image diffing
    serializers.ts        # json / text / html
    types.ts              # ApproveOptions, SerializerName, Serializer
  test/
    core/                 # unit tests for each module
    acceptance/           # dogfood domain + adapter + specs
      domains/
        aver-approvals.ts
      adapters/
        aver-approvals.unit.ts
      approval-testing.spec.ts
  package.json
  tsconfig.json
  tsup.config.ts
```

### Dependencies

- **Peer dep:** `aver`
- **Dep:** diff library (e.g. `diff`)
- **Optional dep:** `pngjs`, `pixelmatch` (dynamically imported for image diffing)

### Public API

```typescript
// Functions
export { approve } from './approve'

// Types
export type { ApproveOptions, SerializerName, Serializer } from './types'
```

### `approve()` Decomposition

The current 237-line monolith splits into a pipeline:

| Module | Function | Responsibility |
|--------|----------|---------------|
| `paths.ts` | `resolveApprovalPaths()` | Computes all file paths from test path, name, and options |
| `compare.ts` | `compareAndDiff()` | Compares approved vs received, generates diff text using dep |
| `artifacts.ts` | `renderArtifacts()` | Discovers renderer from extensions, renders PNGs, diffs images |
| `approve.ts` | `approve()` | Orchestrates: serialize -> write received -> compare -> render -> report |

Attachment building happens once via a single `buildAttachments()` helper, eliminating the 4x duplication.

### How `approve()` Discovers a Renderer

```typescript
import { getTestContext } from 'aver'
import type { HtmlRenderer } from 'aver'

async function discoverRenderer(): Promise<HtmlRenderer | undefined> {
  const ctx = getTestContext()
  return ctx?.extensions['renderer:html']
}
```

No dynamic imports, no auto-discovery magic, no side-channel. Just reads from the typed extensions that the protocol already provides.

### Bug Fix: Trace Entry Status

When `AVER_APPROVE=1` successfully creates or updates a baseline, the trace entry status is `'pass'`, not `'fail'`. Only actual failures get `'fail'`.

## Protocol-Playwright Changes

### Remove

- `approvalArtifacts` property
- `pngjs` and `pixelmatch` dependencies

### Add

- `renderer:html` in `extensions`
- `approvalBrowser` cleanup in `teardown()`

```typescript
import type { HtmlRenderer } from 'aver'

export function playwright(options?): Protocol<Page> {
  let approvalBrowser: Browser | undefined

  return {
    name: 'playwright',
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
    async teardown(ctx) {
      await browser?.close()
      await approvalBrowser?.close()
      approvalBrowser = undefined
    },
    // ... rest unchanged
  }
}
```

`pngjs` and `pixelmatch` move to `@aver/approvals` since image diffing is an approval concern.

## Acceptance Tests

### Domain: `aver-approvals`

```typescript
const averApprovals = defineDomain({
  name: 'AverApprovals',
  actions: {
    approveValue: action<{ value: unknown; name?: string; serializer?: string }>(),
    approveWithCustomCompare: action<{ value: unknown; approved: unknown }>(),
    approveWithNormalize: action<{ value: unknown; normalize: string }>(),
    setApproveMode: action(),
    clearApproveMode: action(),
  },
  queries: {
    approvedFileExists: query<boolean>(),
    receivedFileContents: query<string>(),
    diffFileContents: query<string>(),
    traceAttachments: query<Array<{ name: string; path: string }>>(),
  },
  assertions: {
    baselineCreated: assertion(),
    baselineMissing: assertion(),
    mismatchDetected: assertion(),
    diffContains: assertion<{ text: string }>(),
    attachmentsRecorded: assertion<{ minCount: number }>(),
    traceEntryStatus: assertion<{ name: string; status: 'pass' | 'fail' }>(),
  },
})
```

### Test Scenarios

1. **Baseline missing** — approve without existing baseline fails with correct error
2. **Baseline creation** — AVER_APPROVE=1 creates approved file
3. **Match passes silently** — approved == received returns without error
4. **Mismatch detection** — different values throws with diff
5. **Mismatch then approve** — update flow: change value, approve, verify new baseline
6. **Custom compare function** — user-provided comparison logic
7. **Custom normalize function** — normalization applied before comparison
8. **Multi-approval in one test** — multiple approve() calls with different names
9. **Trace attachments wired** — approval artifacts appear in test trace
10. **Trace status correct** — pass on success, fail on failure
11. **No renderer available** — text-only diffs when protocol has no renderer:html
12. **Renderer integration** — mock renderer in test adapter, verify PNG paths exist

## Breaking Changes

| Before | After |
|--------|-------|
| `import { approve } from 'aver'` | `import { approve } from '@aver/approvals'` |
| `protocol.approvalArtifacts: ApprovalArtifactProvider` | `protocol.extensions: { 'renderer:html': HtmlRenderer }` |
| `ApprovalArtifactProvider` in core | Removed. `HtmlRenderer` in core (generic capability). |
| Approval context wired in core | Generic `RunningTestContext` wired in core |

## Example App Update

```typescript
// examples/task-board/tests/task-board.spec.ts
import { suite } from 'aver'
import { approve } from '@aver/approvals'  // updated import
```

Playwright adapter already provides `renderer:html` via extensions. No config change needed beyond the import.

## Out of Scope

- CLI `aver approve` (keep as-is for now, update import path)
- Custom serializer registration (future)
- Watch mode / interactive approval workflow (future)
- CI upload guidance (docs, not code)
