# @aver/agent-plugin

Agent plugin for [Aver](https://github.com/njackson/aver) — domain-driven acceptance testing.

## What's Included

- **MCP Server** — pre-configured `aver-mcp` with tools for exploring domains, managing scenarios, running tests, and scaffolding code
- **Skill** — `aver-workflow` facilitates scenario mapping and domain design, delegates implementation to other skills (5-stage pipeline: captured → characterized → mapped → specified → implemented)

## Installation

Install the MCP server (peer dependency) and the plugin:

```bash
npm install @aver/mcp-server
claude plugin add @aver/agent-plugin
```

Or point Claude Code at the plugin directory:

```bash
claude --plugin-dir path/to/node_modules/@aver/agent-plugin
```

## Usage

Once installed, Claude Code can:

1. Explore your Aver domains and adapters via MCP tools
2. Follow the scenario mapping workflow when adding features
3. Use `/aver:aver-workflow` to invoke the skill directly

## MCP Tools

### Scenario Tools

| Tool | Description |
|------|-------------|
| `get_workflow_phase` | Determine current workflow phase |
| `get_scenario_summary` | Overview of scenarios by stage |
| `get_scenarios` | List scenarios, optionally filtered by stage |
| `capture_scenario` | Capture a new scenario (observed behavior or confirmed intent) |
| `advance_scenario` | Move scenario to next maturity stage |
| `revisit_scenario` | Move scenario back to a previous stage |
| `add_question` | Attach a question to a scenario |
| `resolve_question` | Mark a question as answered |
| `link_to_domain` | Connect scenario to an Aver domain |
| `get_advance_candidates` | Find scenarios ready to advance |
| `export_scenarios` | Export scenarios as portable JSON |
| `import_scenarios` | Import scenarios from JSON |

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
