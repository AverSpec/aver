---
layout: default
title: AI-Assisted Testing
parent: Guides
nav_order: 8
---

# AI-Assisted Testing

Aver integrates with AI coding agents through the Model Context Protocol (MCP) and agent skills. This guide covers setup, what you get, and what a real session looks like.

## The simplest integration

Any agent that can run shell commands can use Aver as a verification layer:

```bash
npx aver run
# Exit 0 = all behavioral specs pass
# Non-zero = failures with action traces
```

Define your domain vocabulary, write acceptance tests, and let the agent implement code until `aver run` passes. This works with Claude Code, Cursor, Cline, Aider, or any agent that can run tests.

If that's all you need, stop here. Everything below adds structured workflow and scenario management on top.

---

## Setting up the Claude Code plugin

The `@aver/agent-plugin` bundles an MCP server and two agent skills. Install it:

```bash
npm install --save-dev @aver/agent-plugin @aver/mcp-server
```

### 1. Configure the MCP server

Add an `.mcp.json` file to your project root:

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

This tells Claude Code to start the Aver MCP server when it opens your project. The server provides tools for exploring domains, managing scenarios, running tests, and inspecting failures — all callable by the agent during conversation.

### 2. Enable the plugin

Add to your project's `.claude/settings.json`:

```json
{
  "enableAllProjectMcpServers": true
}
```

Or selectively enable the MCP server from Claude Code's settings.

### 3. Install the skills

The plugin ships two skills as markdown files. Claude Code picks them up automatically when installed as a plugin. To register as a plugin, add to `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "aver-plugins": {
      "source": {
        "source": "directory",
        "path": "node_modules/@aver/agent-plugin"
      }
    }
  },
  "enabledPlugins": {
    "aver@aver-plugins": true
  }
}
```

### 4. Verify

Start Claude Code in your project and ask it to run `/aver:aver-workflow`. It should load the skill and call `get_workflow_phase` to orient itself.

---

## What you get

### MCP tools

The MCP server exposes tools the agent calls during conversation:

| Category | Tools | Purpose |
|----------|-------|---------|
| **Scenarios** | `capture_scenario`, `advance_scenario`, `confirm_scenario`, `add_question`, `resolve_question` | Manage scenarios through the maturity pipeline |
| **Backlog** | `create_backlog_item`, `get_backlog_items`, `move_backlog_item` | Track work items that drive scenario creation |
| **Domains** | `list_domains`, `get_domain_vocabulary`, `list_adapters` | Explore what's already built |
| **Testing** | `run_tests`, `get_failure_details`, `get_test_trace`, `get_run_diff` | Run and inspect tests without leaving the conversation |

### Skills

**`aver-workflow`** — The main skill. Facilitates collaborative sessions: Example Mapping, Story Mapping, investigation, and domain design. It guides the agent through the scenario pipeline with human checkpoints at every stage. The agent proposes; you confirm, refine, or reject.

**`telemetry`** — Augments the workflow with telemetry-specific guidance: which operations to instrument, how to design correlation attributes, how to implement adapters with OTel spans, and how to diagnose causal-break failures.

---

## The scenario pipeline

Scenarios move through five maturity stages. The agent facilitates, but the human confirms at every transition:

```
captured → characterized → mapped → specified → implemented
```

| Stage | What happens | Who decides |
|-------|-------------|-------------|
| **captured** | Record observed or intended behavior | Agent proposes, human reviews |
| **characterized** | Investigate code, find seams, attach evidence | Agent investigates, presents findings |
| **mapped** | Example Mapping: derive rules, examples, questions | Collaborative — agent proposes, human confirms |
| **specified** | Name domain vocabulary — actions, queries, assertions | Agent proposes names, **human approves** |
| **implemented** | TDD inner loop until tests pass | Agent implements, human reviews |

**Hard blocks**: The agent cannot advance a scenario without human confirmation. Questions must be resolved before moving from `mapped` to `specified`. Vocabulary names must be approved before implementation begins.

See the [Scenario Pipeline guide](scenario-pipeline) for the methodology behind these stages.

---

## What a session looks like

Here's a typical flow for adding a new feature:

**You:** "Users should be able to reset their password via email."

**Agent:** Calls `capture_scenario` with the behavior. Asks: "Is this one scenario or multiple? I see at least: request reset, receive email, set new password, expired token handling."

**You:** "That's four scenarios. Capture them all."

**Agent:** Captures four scenarios. Calls `get_advance_candidates` to see what's ready. Starts an Example Mapping session for the first one.

**Agent:** "For 'request password reset' — here are the rules I see: (1) must provide a registered email, (2) sends a reset link, (3) link expires after 24 hours. Any rules I'm missing? Any questions?"

**You:** "What happens if the email doesn't exist? We probably shouldn't reveal that."

**Agent:** Calls `add_question` with that question. "Good catch — should we return the same success message regardless of whether the email exists?"

**You:** "Yes, same message either way."

**Agent:** Calls `resolve_question`, updates the rules, proposes vocabulary: `requestReset` action, `resetEmailSent` assertion, `resetDenied` assertion. Asks for approval.

**You:** "Call it `requestPasswordReset` — be explicit."

**Agent:** Updates, advances to `specified`, then starts TDD implementation using `run_tests` and `get_failure_details` in a loop until all tests pass.

The agent uses MCP tools throughout — you see the tool calls in the conversation and can intervene at any point.

---

## Two entry paths

**Legacy code** (behavior unknown): Start with investigation. The agent reads code, captures approval baselines, and discovers behaviors. Scenarios go through all five stages.

```
captured → characterized → mapped → specified → implemented
```

**Greenfield** (intent known): Skip characterization. State what you want, go straight to Example Mapping.

```
captured → mapped → specified → implemented
```

---

## Workspace CLI

You can also manage scenarios from the command line, outside of an agent session:

```bash
aver workspace capture "user can reset password"
aver workspace list
aver workspace advance <id> --rationale "rules confirmed"
aver workspace question <id> "what happens with expired tokens?"
aver workspace candidates
```

See `aver workspace --help` for all commands, or the [Workspace CLI reference](workspace-cli) for details.
