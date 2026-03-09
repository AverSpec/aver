---
layout: default
title: MCP Server
parent: Guides
nav_order: 10
---

# MCP Server

The `@aver/mcp-server` package lets AI assistants (Claude Code, Cursor, etc.) explore your domains, run tests, and analyze failures through the Model Context Protocol.

## Install

### With the Agent Plugin (Recommended)

The easiest way to get started is with the agent plugin, which bundles the MCP server and workflow skills. See the [AI-Assisted Testing](ai-assisted) guide for full setup instructions.

### Standalone

Install the MCP server package:

```bash
npm install @aver/mcp-server
```

Then add the server to your MCP client configuration.

**Claude Code** — add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "aver": {
      "command": "npx",
      "args": ["aver-mcp"]
    }
  }
}
```

**Cursor** — add to your Cursor MCP settings with the same configuration.

The server auto-detects `aver.config.ts` in the working directory. Use `--config path/to/aver.config.ts` to specify a different location.

## Available Tools

### Scenario Management

| Tool | Description |
|:-----|:------------|
| `capture_scenario` | Record an observed or intended behavior |
| `get_scenarios` | List scenarios, filter by stage/story/keyword |
| `get_scenario_summary` | Counts per stage, open questions |
| `advance_scenario` | Move a scenario to the next stage |
| `batch_advance_scenarios` | Advance multiple scenarios at once |
| `revisit_scenario` | Move a scenario back to an earlier stage |
| `batch_revisit_scenarios` | Revisit multiple scenarios at once |
| `confirm_scenario` | Human-only gate — sets `confirmedBy` |
| `update_scenario` | Update scenario fields (rules, examples, context, etc.) |
| `delete_scenario` | Remove a scenario |
| `add_question` | Attach an open question to a scenario |
| `resolve_question` | Mark a question as answered |
| `link_to_domain` | Connect a scenario to domain operations and tests |
| `get_advance_candidates` | Find scenarios ready to advance |
| `get_workflow_phase` | Detect current phase from scenario state |
| `export_scenarios` | Export as markdown or JSON |
| `import_scenarios` | Import from JSON |

### Backlog

| Tool | Description |
|:-----|:------------|
| `create_backlog_item` | Create a new backlog item |
| `get_backlog_items` | List items with filters (status, priority, type) |
| `get_backlog_summary` | Counts by status and priority |
| `update_backlog_item` | Update status, priority, description, etc. |
| `delete_backlog_item` | Remove a backlog item |
| `move_backlog_item` | Reorder or reprioritize |

### Domain Exploration

| Tool | Description |
|:-----|:------------|
| `list_domains` | List all registered domains with vocabulary summaries |
| `get_domain_vocabulary` | Get actions, queries, and assertions for a domain |
| `list_adapters` | List all registered adapters with protocol info |

These tools let the AI understand your test vocabulary without reading source files.

### Test Execution

| Tool | Description |
|:-----|:------------|
| `run_tests` | Run tests via `aver run` and persist results |
| `get_failure_details` | Get failure details from the latest run |
| `get_test_trace` | Get the action trace for a specific test |
| `get_run_diff` | Compare two runs — shows newly passing/failing tests |

### Scaffolding

| Tool | Description |
|:-----|:------------|
| `get_project_context` | Get project file paths, adapter mappings, and naming conventions |
| `describe_domain_structure` | Generate a domain template from a natural language description |
| `describe_adapter_structure` | Show handler structure for a domain/protocol pair |

`get_project_context` is particularly important because Aver uses phantom types — `action<{ title: string }>()` produces just `{ kind: 'action' }` at runtime. The MCP server can tell the AI *where* files live, but the AI needs to read the TypeScript source to see payload and return types.

## Example Workflow

A typical AI-assisted workflow when adding a new feature:

1. **Explore:** `list_domains` → `get_domain_vocabulary` to understand existing vocabulary
2. **Locate:** `get_project_context` to find file paths, then read the domain file for type signatures
3. **Define:** Add the action/query/assertion to the domain — TypeScript flags all adapters
4. **Test:** Write the test first using domain language
5. **Implement:** Add handlers to each adapter
6. **Verify:** `run_tests` → `get_run_diff` to confirm new tests pass and nothing broke

For debugging existing failures:

1. **Investigate:** `get_failure_details` → `get_test_trace("checkout flow")`
2. **Fix code** based on the domain-language trace
3. **Verify:** `run_tests` → `get_run_diff` → confirms failures are now passing

The plugin's `aver-workflow` skill teaches this pattern automatically, so the AI follows it without needing manual guidance.

See [AI-Assisted Testing](ai-assisted) for an overview of all AI integration options.
