---
layout: default
title: AI-Assisted Testing
parent: Guides
nav_order: 6
---

# AI-Assisted Testing

Aver integrates with AI coding agents through the Model Context Protocol (MCP) and agent skills. This guide covers setup and usage.

## The simplest integration

Any agent that can run shell commands can use Aver as a verification layer:

```bash
npx aver run
# Exit 0 = all behavioral specs pass
# Non-zero = failures with action traces
```

Define your domain vocabulary, write acceptance tests, and let the agent implement code until `aver run` passes. This works with Claude Code, Cursor, Cline, Aider, or any agent that can run tests.

## Claude Code plugin

Install the `@aver/agent-plugin` for richer integration:

```bash
npm install --save-dev @aver/agent-plugin @aver/mcp-server
```

The plugin provides:
- **MCP tools** for scenario and backlog management
- **Workflow skill** for collaborative Example Mapping and domain design
- **Telemetry skill** for observability design and OTel context propagation diagnosis

### MCP tools

The MCP server exposes tools for managing scenarios through a maturity pipeline:

| Category | Tools |
|----------|-------|
| **Scenarios** | `capture_scenario`, `advance_scenario`, `get_scenarios`, `update_scenario`, `confirm_scenario`, `add_question`, `resolve_question` |
| **Backlog** | `create_backlog_item`, `get_backlog_items`, `update_backlog_item`, `move_backlog_item` |
| **Domains** | `list_domains`, `get_domain_vocabulary`, `list_adapters` |
| **Testing** | `run_tests`, `get_failure_details`, `get_test_trace`, `get_run_diff` |

### Scenario pipeline

Scenarios move through five maturity stages:

```
captured → characterized → mapped → specified → implemented
```

- **captured**: Observed or intended behavior recorded
- **characterized**: Code investigated, evidence attached
- **mapped**: Example Mapping session completed — rules, examples, questions resolved
- **specified**: Domain vocabulary named and approved
- **implemented**: Tests passing, domain linked

### Skills

The plugin includes two skills:

**`aver-workflow`** — Facilitates collaborative sessions: Example Mapping, Story Mapping, investigation, and domain design. Guides the agent through the scenario pipeline with human checkpoints at every stage.

**`telemetry`** — Augments the workflow with telemetry-specific guidance: which operations to instrument, how to design correlation attributes, how to implement adapters with OTel spans, and how to diagnose causal-break failures.

## Workspace CLI

Manage scenarios from the command line:

```bash
aver workspace capture "user can reset password"
aver workspace list
aver workspace advance <id> --rationale "rules confirmed"
aver workspace question <id> "what happens with expired tokens?"
aver workspace candidates
```

See `aver workspace --help` for all commands.
