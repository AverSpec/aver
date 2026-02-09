# DX Review Progress — Phase 1 Complete

**Date**: 2026-02-09
**Branch**: `feat/dx-review`
**Status**: Phase 1 (DX Review) done. Ready for Phase 2 (Finish Features).

## What Was Done

### 1A. Registry Exports Renamed
- `_registerAdapter` → `registerAdapter`
- `_findAdapter` → `findAdapter`
- `_getAdapters` → `getAdapters`
- `_resetRegistry` → `resetRegistry`
- Added `findAdapters(domain)` — returns ALL matching adapters (for multi-adapter)
- Updated 18 files across core + MCP server + all tests

### 1B. Suite API Rewritten — Callback Style + Multi-Adapter
**Before:**
```typescript
const s = suite(myDomain)
beforeEach(async () => {
  _resetRegistry()
  _registerAdapter(myAdapter)
  await s._setupForTest()
})
afterEach(async () => { await s._teardownForTest() })
it('test', async () => { await s.domain.doThing() })
```

**After:**
```typescript
const { test } = suite(myDomain, myAdapter)
test('test', async ({ domain }) => { await domain.doThing() })
```

Key changes:
- `suite(domain, adapter?)` — adapter optional, falls back to registry
- `test(name, fn)` wraps Vitest's `test()`, passes `{ domain, trace }` via callback
- Setup/teardown happens per-test inside the wrapper (no lifecycle hook ordering issues)
- Multi-adapter: parameterized test names (`test name [protocol]`)
- On failure: action trace auto-appended with `[PASS]`/`[FAIL]` formatting
- Programmatic API preserved: `suite.setup()`, `.teardown()`, `.getTrace()`, `.domain` for meta-testing
- Old `Suite` interface → new `SuiteReturn` interface
- `suite.test()` removed (was dead code, feature absorbed into new `test()`)

### 1C. defineConfig Auto-Registers Adapters
- `defineConfig({ adapters: [...] })` now calls `registerAdapter()` for each adapter
- Makes `aver.config.ts` the canonical registration point
- New unit test verifies auto-registration

### 1D-E. Error Messages + Trace Formatting
- Missing adapter error lists registered adapters + hint
- Trace uses `[PASS]`/`[FAIL]`, truncates long payloads (>60 chars), includes error messages

### 1F. All Tests Migrated
- 8 acceptance test files (4 core + 4 MCP server) use new callback API
- 2 adapter files updated (`aver-core.direct.ts`, `aver-mcp.direct.ts`)
- Unit tests updated for new API
- Zero `_`-prefixed imports remaining

## Test Results
- **88 tests passing** (49 aver + 37 mcp-server + 2 protocol-playwright)
- Up from 85 (3 new tests for callback API + defineConfig auto-registration)

## What's Next (from roadmap)
- Phase 2: HTTP protocol, `aver init` scaffolding, CI reporter
- Phase 3: E-commerce example
- Phase 4: Docs site + blog
- Also: install MCP server in project for hands-on testing before writing docs

## Key Files Changed
- `packages/aver/src/core/registry.ts` — renamed exports + `findAdapters()`
- `packages/aver/src/core/suite.ts` — full rewrite
- `packages/aver/src/core/config.ts` — auto-registration
- `packages/aver/src/index.ts` — updated exports
- All acceptance test files and adapters
- MCP server source files (`domains.ts`, `scaffolding.ts`)
- MCP server test files

## Not Yet Committed
All changes are on `feat/dx-review` branch, unstaged.
