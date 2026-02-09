# Aver MCP Server Design

**Status**: Validated — ready for implementation planning.

---

## Overview

`@aver/mcp-server` is a separate npm package that exposes Aver's domain-driven testing capabilities to AI agents and AI-assisted developers via the Model Context Protocol (MCP).

**Primary users:** AI coding agents (Claude Code, Cursor, etc.) and developers working through AI assistants.

**Core principle:** Progressive detail — start with summaries, let the agent drill into specifics on demand. Never dump everything at once.

## Package & Architecture

- **Package:** `@aver/mcp-server` at `packages/mcp-server` in the monorepo
- **Transport:** stdio (standard for local MCP servers)
- **Dependencies:** `@modelcontextprotocol/sdk` (runtime), `aver` (peer)
- **Config discovery:** Auto-detects `aver.config.ts` from cwd, overridable with `--config`
- **Registry access:** Imports internal APIs (`_findAdapter`, `_registerAdapter`) directly — first-party package, no formalization needed

### Usage

```json
{
  "mcpServers": {
    "aver": {
      "command": "npx",
      "args": ["@aver/mcp-server"]
    }
  }
}
```

### Startup Sequence

1. Parse `--config` flag or scan cwd for `aver.config.ts`
2. Import the config (registers adapters into the module-level registry)
3. Start MCP server on stdio
4. Expose 9 tools

## MCP Tools (9 tools)

### Domain Exploration (3 tools)

**`list_domains`** — No arguments. Returns domain summaries.

```json
[
  {
    "name": "cart",
    "actions": ["addItem", "removeItem", "clearCart"],
    "queries": ["getTotal", "getItemCount"],
    "assertions": ["totalEquals", "cartIsEmpty"],
    "actionCount": 3,
    "queryCount": 2,
    "assertionCount": 2
  }
]
```

Implementation: iterates registered adapters, extracts unique domains, reads `domain.vocabulary` keys.

**`get_domain_vocabulary`** — Takes `{ domain: string }`. Returns full vocabulary organized by kind.

```json
{
  "name": "cart",
  "actions": ["addItem", "removeItem", "clearCart"],
  "queries": ["getTotal", "getItemCount"],
  "assertions": ["totalEquals", "cartIsEmpty"]
}
```

Names only — no type information. Payload/return types are phantom types that exist only at compile time (`__payload`, `__return` are undefined at runtime). Vocabulary names are the most valuable part for agents. Type info can be added later if it earns its place.

**`list_adapters`** — No arguments. Returns registered adapters.

```json
[
  { "domainName": "cart", "protocolName": "playwright" },
  { "domainName": "cart", "protocolName": "direct" }
]
```

Implementation: reads the adapter registry directly.

### Test Execution (3 tools)

Progressive detail: summary → failure traces → full traces.

**`run_tests`** — Takes `{ domain?: string, adapter?: string }`. Executes test suites and returns a summary.

```json
{
  "runId": "2026-02-08T14:30:00.000Z",
  "total": 45,
  "passed": 43,
  "failed": 2,
  "skipped": 0,
  "failures": [
    { "testName": "should calculate correct total", "domain": "cart" },
    { "testName": "should clear all items", "domain": "cart" }
  ]
}
```

Only failed test names — no traces, no error details. The agent calls `get_failure_details` to drill in.

**Implementation:** Shells out to `npx vitest run --reporter=json` (or `aver run` with JSON output) and parses the structured results. Avoids building a second test runner. Results are persisted to `.aver/runs/<ISO-timestamp>.json` after each run.

**`get_failure_details`** — Takes `{ domain?: string, testName?: string }`. Returns action traces for failed tests from the most recent run.

```json
{
  "failures": [
    {
      "testName": "should calculate correct total",
      "domain": "cart",
      "error": "Expected 42, got 40",
      "trace": [
        { "kind": "action", "name": "addItem", "payload": {"item": "widget", "quantity": 2}, "status": "pass" },
        { "kind": "query", "name": "getTotal", "status": "fail", "error": "Expected 42, got 40" }
      ]
    }
  ]
}
```

**`get_test_trace`** — Takes `{ testName: string }`. Returns the full action trace for any test regardless of pass/fail. For understanding flow, not just debugging failures.

**Note on traces:** The `aver run` CLI or Vitest reporter will need to output trace data in structured JSON format. The trace format matches the existing `TraceEntry` type in core.

### Scaffolding (2 tools)

**`describe_domain_structure`** — Takes `{ description: string }`. Returns a lightweight skeleton spec based on Aver's patterns. The server doesn't do NLP — it provides a template structure the agent should adapt.

```json
{
  "suggestedName": "cart",
  "actions": [
    { "name": "addItem", "payloadDescription": "item name and quantity" },
    { "name": "removeItem", "payloadDescription": "item name" },
    { "name": "clearCart", "payloadDescription": "none" }
  ],
  "queries": [
    { "name": "getTotal", "returnDescription": "numeric total" },
    { "name": "getItemCount", "returnDescription": "number of items" }
  ],
  "assertions": [
    { "name": "totalEquals", "payloadDescription": "expected total" },
    { "name": "cartIsEmpty", "payloadDescription": "none" }
  ]
}
```

The tool does the domain decomposition — splitting a description into actions/queries/assertions. The agent writes the actual TypeScript. The server doesn't generate code.

**`describe_adapter_structure`** — Takes `{ domain: string, protocol: string }`. Reads an existing domain's vocabulary and returns the handler names organized by kind.

```json
{
  "domain": "cart",
  "protocol": "playwright",
  "handlers": {
    "actions": ["addItem", "removeItem", "clearCart"],
    "queries": ["getTotal", "getItemCount"],
    "assertions": ["totalEquals", "cartIsEmpty"]
  }
}
```

Same phantom type limitation — handler names only, no TypeScript signatures. The agent infers types from context or the domain source file.

### Incremental Reporting (1 tool)

**`get_run_diff`** — No arguments. Compares the two most recent test runs and returns what changed.

```json
{
  "previousRun": "2026-02-08T14:00:00.000Z",
  "currentRun": "2026-02-08T14:30:00.000Z",
  "newlyFailing": ["should clear all items"],
  "newlyPassing": ["should add item to empty cart"],
  "stillFailing": ["should calculate correct total"],
  "stillPassing": 38
}
```

`stillPassing` is a count, not a list — only changes matter.

## Persistence

Test results are persisted to `.aver/runs/` as JSON files (one per run, timestamped). Format:

```json
{
  "timestamp": "2026-02-08T14:30:00.000Z",
  "results": [
    { "testName": "...", "domain": "...", "status": "pass|fail|skip", "trace": [...] }
  ]
}
```

**Retention:** Keep the last 10 run files. On each new run, delete files beyond the limit.

**`.gitignore`:** The `.aver/` directory should be gitignored. It's local ephemeral data.

## Reporting Strategy

### Progressive Detail

1. **Summary level** (`run_tests`): "43 passed, 2 failed" + failed test names
2. **Failure detail** (`get_failure_details`): action traces for failures only
3. **Full trace** (`get_test_trace`): complete step-by-step for any test

Agents call the level they need. No wasted tokens on passing tests when investigating a failure.

### Incremental Reporting

`get_run_diff` compares runs and reports what changed. This naturally connects to future approval testing:

- **Test results diff**: newly failing, newly passing, regressions, fixes
- **Approval status** (future): pending approvals, baseline changes

This is the most novel tool — agents can't easily diff test runs on their own.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Packaging | Separate `@aver/mcp-server` | Keeps core zero-dep, opt-in |
| Transport | stdio | Standard for local MCP servers |
| Config discovery | Auto-detect + `--config` override | Convention over configuration |
| Registry access | Import internals directly | First-party package, no formalization needed |
| Reporting | Progressive detail (3 levels) | Token-efficient, matches MCP tool-call model |
| Test execution | Shell out to vitest/aver run | Reuse existing runner, don't build a second one |
| Scaffolding | Tool returning JSON specs, not code | Let the agent write code; server provides structure |
| Domain decomposition | Lightweight template, not NLP | Server provides patterns, agent does the thinking |
| Type information | Names only (no phantom types at runtime) | Add runtime type descriptions later if needed |
| Result storage | Persist to `.aver/runs/` on disk | Survives server restarts, enables cross-session diffs |
| Incremental reporting | Diff against previous run | Novel value, ties into future approval testing |
| Retention | Last 10 runs | Simple, prevents unbounded growth |

## Future Considerations

- **Approval testing integration:** `get_run_diff` will surface pending approvals when the approval testing layer lands. A future `list_pending_approvals` tool could show diffs between received and approved baselines. Approvals remain human-gated.
- **Runtime type information:** If agents consistently need type info, domains could optionally provide runtime type descriptions via the markers.
- **MCP resources:** Domains and test results could be exposed as MCP resources (readable, subscribable data) in addition to tools.
- **Vibium protocol:** `@aver/protocol-vibium` could complement Playwright. Aver's MCP server is about test domain knowledge, not browser automation.
