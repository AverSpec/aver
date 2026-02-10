# Example App Implementation Progress

**Date**: 2026-02-09
**Branch**: `feat/dx-review`
**Status**: 8/12 tests passing, playwright adapter debugging in progress

## What's Done

### Core Changes
- `query<Payload, Return>()` — parameterized query input support added to core (50 tests passing)
- `@aver/protocol-http` — new package, thin fetch wrapper (5 tests passing)
- Core rebuilt with both changes

### Example App (`examples/e-commerce/`)
- Express API + Board class (pure business logic)
- React + Vite SPA (kanban board with 3 columns, data-testid attributes)
- Task board domain (3 actions, 2 queries, 3 assertions)
- Direct adapter — 4/4 passing
- HTTP adapter — 4/4 passing
- Playwright adapter — created, debugging timeouts
- aver.config.ts + test file with 4 tests

## Issues Found & Fixed

### 1. `globals: true` required in vitest.config.ts
`suite()` uses `(globalThis as any).test` to register tests with Vitest. This works when Vitest injects globals, but the example workspace didn't have `globals: true`. Without it, `globalThis.test` is undefined and `suite().test()` silently does nothing → "No test suite found" error.

**Fix**: Created `vitest.config.ts` with `globals: true` and `testTimeout: 15000`.

### 2. Express 5 wildcard route breaking change
Express 5 uses path-to-regexp v8+ which requires named parameters. `app.get('*', handler)` throws `Missing parameter name at index 1`.

**Fix**: Changed to `app.get('{*path}', handler)`.

### 3. Playwright `getByTestId(/^task-/)` matching too many elements
Card elements have `data-testid="task-Fix login bug"` but children had `data-testid="task-title"` and `data-testid="task-assignee"`. The regex `/^task-/` matched both cards AND their children, doubling the count.

**Fix**: Renamed child test IDs to `card-title` and `card-assignee` in both the SPA and playwright adapter.

### 4. Playwright adapter timeouts (current issue)
All 4 playwright tests timeout at 15s. Root cause: original adapter launched a new browser per test (slow, ~5s cold start). Reworked to reuse a single browser instance across tests, creating fresh pages + servers per test.

## Still TODO
- Verify playwright adapter fix works (reuse browser, fresh page+server per test)
- Run all 12 tests together
- Commit everything
- Run full monorepo verification (all packages)
- Update MEMORY.md

## Commits Made (uncommitted example work still pending)
- `dd68ca9` — feat: add query input parameters — query<Payload, Return>()
- `496714b` — feat: add @aver/protocol-http package
- `32816aa` — feat: add example app scaffolding with Express API
- `6aa6178` — feat: add task-board domain and direct adapter
- `4d79214` — feat: add HTTP adapter for task board example
- `d41679c` — feat: add Playwright adapter for task board example
- `3b71bf7` — feat: add React SPA for task board example
- (pending) — vitest config, test file, aver.config, bug fixes
