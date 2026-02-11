# @aver/claude-code-plugin

Claude Code plugin for [Aver](https://github.com/njackson/aver) — domain-driven acceptance testing.

## What's Included

- **MCP Server** — pre-configured `aver-mcp` with tools for exploring domains, running tests, and scaffolding code
- **Skill** — `aver-workflow` teaching the domain-first BDD workflow with code examples

## Installation

```bash
claude plugin add @aver/claude-code-plugin
```

Or point Claude Code at the plugin directory:

```bash
claude --plugin-dir path/to/node_modules/@aver/claude-code-plugin
```

## Usage

Once installed, Claude Code can:

1. Explore your Aver domains and adapters via MCP tools
2. Follow the domain-first BDD workflow when adding features
3. Use `/aver:aver-workflow` to invoke the skill directly

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_domains` | List all registered domains |
| `get_domain_vocabulary` | Get actions, queries, assertions for a domain |
| `list_adapters` | List all adapters with domain and protocol |
| `get_project_context` | Get project file paths and conventions |
| `run_tests` | Run the test suite |
| `get_failure_details` | Inspect test failures |
| `get_test_trace` | Get execution trace for a test |
| `get_run_diff` | Compare last two test runs |
| `describe_domain_structure` | Generate a domain template |
| `describe_adapter_structure` | Describe adapter handler structure |

## Requirements

- Node.js >= 18
- An Aver project with `aver.config.ts`
- `@aver/mcp-server` installed (peer dependency)
