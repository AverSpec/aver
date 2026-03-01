# @aver/mcp-server

> **Status: Experimental** — API may change between minor versions.

MCP server for [Aver](../../README.md) domain-driven acceptance testing. Exposes domain exploration, test execution, and scaffolding tools to AI assistants.

## Install

```bash
npm install @aver/mcp-server
```

## Setup

Add to your MCP client configuration (e.g. Claude Code, Cursor):

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

The server auto-detects `aver.config.ts` in the current directory.

## Tools

| Tool | Description |
|------|-------------|
| `list_domains` | List all registered domains with vocabulary summaries |
| `get_domain_vocabulary` | Get actions, queries, and assertions for a domain |
| `list_adapters` | List all registered adapters |
| `run_tests` | Run tests and persist results |
| `get_failure_details` | Get failure details from the latest run |
| `get_test_trace` | Get the action trace for a specific test |
| `get_run_diff` | Compare two runs — newly passing/failing tests |
| `describe_domain_structure` | Generate a domain template from a description |
| `describe_adapter_structure` | Show handler structure for a domain/protocol pair |

## License

[MIT](../../LICENSE)
