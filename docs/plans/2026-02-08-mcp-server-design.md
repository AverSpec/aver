# Aver MCP Server Design

**Status**: Draft — captured from brainstorm session, needs validation through implementation.

---

## Overview

`@aver/mcp-server` is a separate npm package that exposes Aver's domain-driven testing capabilities to AI agents and AI-assisted developers via the Model Context Protocol (MCP).

**Primary users:** AI coding agents (Claude Code, Cursor, etc.) and developers working through AI assistants — both equally.

**Core principle:** Progressive detail — start with summaries, let the agent drill into specifics on demand. Never dump everything at once.

## Package & Architecture

- Separate package: `@aver/mcp-server` (keeps core zero-dep)
- Transport: stdio (standard for local MCP servers)
- Dependency: `@modelcontextprotocol/sdk` + `aver` (peer)
- Discovery: auto-detects `aver.config.ts` from cwd, overridable with `--config`

### Usage

```json
{
  "mcpServers": {
    "aver": {
      "command": "npx",
      "args": ["@aver/mcp-server", "--config", "./aver.config.ts"]
    }
  }
}
```

The server imports from `aver` core to access domain definitions, the registry, and suite execution. It consumes the public API plus internal registry APIs (`_findAdapter`, `_registerAdapter`) — these may need to be formalized as a semi-public API surface for server integrations.

## Capabilities

Four capability areas:

1. **Explore domains** — list domains, browse vocabulary, understand test landscape
2. **Run tests** — execute suites, get results with domain-level traces, filter by domain/adapter
3. **Scaffold new tests** — return structured specs (JSON) that agents render into TypeScript
4. **Debug failures** — inspect failed test traces, drill into adapter-level errors

## MCP Tools (9 tools)

### Domain Exploration

| Tool | Arguments | Returns |
|------|-----------|---------|
| `list_domains` | none | Domain names + summary (action/query/assertion counts) |
| `get_domain_vocabulary` | `domain: string` | Full vocabulary: action names + payload types, query names + return types, assertion names + payload types |
| `list_adapters` | none | Registered adapters with domain name and protocol name |

### Test Execution

| Tool | Arguments | Returns |
|------|-----------|---------|
| `run_tests` | `domain?: string`, `adapter?: string` | Summary only: total, passed, failed, skipped. No traces (progressive detail). |
| `get_failure_details` | `domain?: string`, `testName?: string` | Action traces for failed tests only. The drill-down from `run_tests`. |
| `get_test_trace` | `testName: string` | Full action trace for a specific test regardless of pass/fail. For debugging or understanding flow. |

### Scaffolding

| Tool | Arguments | Returns |
|------|-----------|---------|
| `describe_domain_structure` | `description: string` | Structured JSON spec: suggested domain name, actions, queries, assertions with payload/return types. Agent writes the TypeScript. |
| `describe_adapter_structure` | `domain: string`, `protocol: string` | Handler signatures the adapter needs to implement. Structured data, not code. |

**Note on `describe_domain_structure`:** This is the least certain tool. It asks the server to do domain decomposition, which may be better left to the agent with an MCP prompt template guiding it. Start with it, cut if it doesn't earn its place.

### Incremental Reporting

| Tool | Arguments | Returns |
|------|-----------|---------|
| `get_run_diff` | none | Compares latest test run against previous: newly failing, newly passing, still failing, still passing. Ties into approval testing — pending approvals surface here. |

## Reporting Strategy

### Progressive Detail

Inspired by Playwright MCP's accessibility snapshot approach (vs Vibium's screenshot-heavy approach). Apply the same principle to test results:

1. **Summary level** (`run_tests`): "43 passed, 2 failed" + failed test names
2. **Failure detail** (`get_failure_details`): action traces for failures only
3. **Full trace** (`get_test_trace`): complete step-by-step for any test

Agents call the level they need. No wasted tokens on passing tests when investigating a failure.

### Incremental Reporting

`get_run_diff` compares runs and reports what changed. This naturally connects to the approval testing layer:

- **Test results diff**: newly failing, newly passing, regressions, fixes
- **Approval status** (when approval testing lands): pending approvals, baseline changes

This is the most novel tool — agents can't easily diff test runs on their own.

## Approval Testing Integration (Future)

The design doc describes approval testing as a Phase 2 feature:
- `approve()` utility wraps query results
- Baselines stored per-adapter
- Pending approvals require human review

The MCP server enhances this:
- `get_run_diff` surfaces pending approvals alongside test result changes
- A future `list_pending_approvals` tool could show diffs between received and approved baselines
- Approvals remain human-gated — the agent can surface them but not auto-approve

## Open Questions

- **Should `describe_domain_structure` be a tool or an MCP prompt template?** Tools return structured data; prompts provide guidance. Domain decomposition might be better as a prompt.
- **How to handle long-running test suites?** `run_tests` could block for minutes. Should it support streaming progress, or should there be a `get_run_status` polling tool?
- **Registry API formalization:** The server needs `_registerAdapter` / `_findAdapter`. Should these become public API, or should we add a dedicated server-facing API surface?
- **Test result storage:** `get_run_diff` needs to compare runs. Where are results stored? In-memory (lost on server restart) or persisted to disk?
- **MCP resources:** Should domains/test results also be exposed as MCP resources (readable data) in addition to tools? Resources allow agents to "subscribe" to changes.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Packaging | Separate `@aver/mcp-server` | Keeps core zero-dep, opt-in |
| Transport | stdio | Standard for local MCP servers |
| Config discovery | Auto-detect + `--config` override | Convention over configuration |
| Reporting | Progressive detail | Token-efficient, matches MCP tool-call model |
| Scaffolding approach | Structured JSON specs, not code | Let the agent write code; server provides structure |
| Incremental reporting | Diff against previous run | Novel value, ties into approval testing |

## Relationship to Other Protocols

Vibium (by Selenium's creator) is browser automation infrastructure with its own MCP server. It operates at the protocol layer (click, type, navigate) while Aver operates at the domain layer (add item, verify total). They're complementary:

- `@aver/protocol-vibium` could be a future protocol package
- Browser protocols (Playwright, Vibium) could share a common interface for portability
- Aver's MCP server is about test domain knowledge, not browser automation
