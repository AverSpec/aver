---
layout: default
title: MCP Server
parent: Guides
nav_order: 2
---

# MCP Server

The `@aver/mcp-server` package lets AI assistants (Claude Code, Cursor, etc.) explore your domains, run tests, and analyze failures through the Model Context Protocol.

## Install

```bash
npm install @aver/mcp-server
```

## Configure Your MCP Client

Add the Aver MCP server to your client configuration.

### Claude Code

Add to `.mcp.json` in your project root:

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

### Cursor

Add to your Cursor MCP settings:

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

The server auto-detects `aver.config.ts` in the working directory. Use `--config path/to/aver.config.ts` to specify a different location.

## Available Tools

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
| `run_tests` | Run tests and persist results |
| `get_failure_details` | Get failure details from the latest run |
| `get_test_trace` | Get the action trace for a specific test |
| `get_run_diff` | Compare two runs — shows newly passing/failing tests |

Results are persisted in `.aver/runs/` (JSON files, 10-run retention).

### Scaffolding

| Tool | Description |
|:-----|:------------|
| `describe_domain_structure` | Generate a domain template from a natural language description |
| `describe_adapter_structure` | Show handler structure for a domain/protocol pair |

These tools help the AI generate correctly-structured domain and adapter code.

## Example Workflow

A typical AI-assisted workflow:

1. **AI explores the domain:** `list_domains` → `get_domain_vocabulary("shopping-cart")`
2. **AI runs tests:** `run_tests` → sees 2 failures
3. **AI investigates:** `get_failure_details` → `get_test_trace("checkout flow")`
4. **AI fixes code** based on the trace
5. **AI verifies:** `run_tests` → `get_run_diff` → confirms the 2 failures are now passing

The action trace in step 3 shows exactly what happened in domain language, so the AI understands the business intent without reading implementation code.
