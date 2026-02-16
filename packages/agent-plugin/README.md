# @aver/agent-plugin

Agent plugin for [Aver](https://github.com/njackson/aver) — domain-driven acceptance testing.

## What's Included

- **MCP Server** — pre-configured `aver-mcp` with tools for exploring domains, managing workspaces, running tests, and scaffolding code
- **Skill** — `aver-workflow` teaching the maturity pipeline workflow (Observed, Explored, Intended, Formalized)

## Installation

```bash
claude plugin add @aver/agent-plugin
```

Or point Claude Code at the plugin directory:

```bash
claude --plugin-dir path/to/node_modules/@aver/agent-plugin
```

## Usage

Once installed, Claude Code can:

1. Explore your Aver domains and adapters via MCP tools
2. Follow the maturity pipeline workflow when adding features
3. Use `/aver:aver-workflow` to invoke the skill directly

## MCP Tools

### Workspace Tools

| Tool | Description |
|------|-------------|
| `get_workflow_phase` | Determine current workflow phase |
| `get_workspace_summary` | Overview of workspace items by phase |
| `get_workspace_items` | List items, optionally filtered by phase |
| `record_observation` | Record something noticed about the system |
| `record_intent` | Record a confirmed behavioral intent |
| `promote_item` | Move item to next maturity phase |
| `demote_item` | Move item back to previous phase |
| `add_question` | Attach a question to a workspace item |
| `resolve_question` | Mark a question as answered |
| `link_to_domain` | Connect workspace item to an Aver domain |
| `get_promotion_candidates` | Find items ready to advance |
| `export_workspace` | Export workspace as portable JSON |
| `import_workspace` | Import workspace from JSON |

### Domain & Testing Tools

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
