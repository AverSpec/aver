# Example App + API Changes — Complete

**Date**: 2026-02-09
**Branch**: `feat/dx-review`
**Status**: ALL DONE — 104 tests passing across 5 packages

## What Was Built This Session

### Core API Changes
1. **`{ act, query, assert }` namespaced proxies** — replaced flat `domain.*` API
   - `suite()` returns `{ test, act, query, assert, setup, teardown, getTrace }`
   - `test(name, fn)` callback passes `{ act, query, assert, trace }`
   - Three typed proxies: `ActProxy`, `QueryProxy`, `AssertProxy`
   - All 88 existing tests migrated to new API

2. **Parameterized queries** — `query<Payload, Return>()`
   - `QueryMarker` now takes two type params: `QueryMarker<P, R>`
   - `QueryHandler` conditionally accepts payload
   - Proxy builder passes payload when present

### New Packages
3. **`@aver/protocol-http`** — thin fetch wrapper
   - `http({ baseUrl })` returns `Protocol<HttpContext>`
   - `HttpContext` has `get`, `post`, `put`, `patch`, `delete` methods
   - 3 unit tests, dual ESM/CJS build

### Example App (`examples/e-commerce/`)
4. **Express API** — `Board` class + REST routes + server factory
5. **React + Vite SPA** — kanban board with 3 columns, data-testid attributes
6. **Task board domain** — 3 actions, 2 queries, 3 assertions
7. **Three adapters:**
   - `direct` — calls Board class in-process
   - `http` — starts Express, calls REST API via fetch
   - `playwright` — starts Express + browser, drives React UI
8. **One test file, 12 test runs** — 4 tests × 3 adapters

## Test Counts
| Package | Tests |
|---------|-------|
| aver (core) | 50 |
| mcp-server | 37 |
| protocol-playwright | 2 |
| protocol-http | 3 |
| example-task-board | 12 |
| **Total** | **104** |

## Commits (on `feat/dx-review`)
```
f107f82 feat: wire up task board tests — 12/12 passing (4 tests × 3 adapters)
4d79214 feat: add HTTP adapter for task board example
d41679c feat: add Playwright adapter for task board example
3b71bf7 feat: add React SPA for task board example
6aa6178 feat: add task-board domain and direct adapter
496714b feat: add @aver/protocol-http package
32816aa feat: add example app scaffolding with Express API
dd68ca9 feat: add query input parameters — query<Payload, Return>()
3e82993 test: migrate MCP server tests to { act, query, assert } API
3bb6a37 test: migrate core tests to { act, query, assert } API
70267a1 feat: split domain proxy into { act, query, assert } namespaces
392e26a docs: add MCP server and pre-release roadmap plans
87ddeb5 feat: improve DX with multi-adapter support, simplified suite API, and better traces
```

## Bugs Found & Fixed
1. **`globals: true` required** — `suite()` relies on `globalThis.test` from Vitest; without `globals: true` in vitest config, tests silently don't register
2. **Express 5 wildcard** — `app.get('*', ...)` → `app.get('{*path}', ...)` (path-to-regexp v8+)
3. **Test ID prefix clash** — `data-testid="task-title"` matched regex `/^task-/` intended for cards; renamed to `card-title`/`card-assignee`
4. **Playwright browser reuse** — launching new browser per test caused 5s+ cold starts; reuse single browser, create fresh page+server per test

## What's Next (from pre-release roadmap)
- [ ] Phase 2B: `aver init` scaffolding CLI command
- [ ] Phase 2C: CI Reporter (JUnit XML)
- [ ] Phase 4: Documentation site (Jekyll + Diataxis)
- [ ] Phase 4D: LICENSE + READMEs
- [ ] Phase 4C: Blog post — "Introducing Aver"
- [ ] Install MCP server in project for hands-on testing
- [ ] Merge `feat/dx-review` → `main` (or create PR)

## Key Architecture Notes for Next Session
- Root `package.json` workspaces: `["packages/*", "examples/*"]`
- Example vitest needs `globals: true` + separate `vitest.config.ts` (not vite.config.ts)
- Must rebuild core (`npm run build -w packages/aver`) before running example or MCP tests
- `examples/e-commerce/dist/` must be built (`npx vite build`) for playwright/http adapters
- Playwright browsers must be installed (`npx playwright install chromium`)
