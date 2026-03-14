---
layout: default
title: AI-Assisted Testing
parent: Guides
nav_order: 8
---

# AI-Assisted Testing

Aver integrates with AI coding agents through a Claude Code plugin that combines agent skills with bash scripts wrapping the `gh` CLI. Scenarios and backlog items are stored as GitHub Issues, giving you full visibility outside agent sessions. This guide covers setup, what you get, and what a real session looks like.

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

The `@averspec/agent-plugin` bundles two agent skills and a set of bash scripts for managing scenarios and backlog via GitHub Issues. Install it:

```bash
npm install --save-dev @averspec/agent-plugin
```

### 1. Register the plugin

Add to your project's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "aver-plugins": {
      "source": {
        "source": "directory",
        "path": "node_modules/@averspec/agent-plugin"
      }
    }
  },
  "enabledPlugins": {
    "aver@aver-plugins": true
  }
}
```

This tells Claude Code to load the Aver skills when it opens your project.

### 2. Configure GitHub Issue labels

Run the label setup script once per repository:

```bash
./node_modules/@averspec/agent-plugin/scripts/gh/setup-labels.sh
```

This creates the `scenario`, `backlog`, `stage:captured`, `stage:characterized`, `stage:mapped`, `stage:specified`, `stage:implemented`, and priority/type labels that the scripts use to track scenarios and backlog items as GitHub Issues.

### 3. Verify

Start Claude Code in your project and ask it to run `/aver:aver-workflow`. It should load the skill and orient itself by reading your domain and adapter files.

---

## What you get

### Bash scripts (`scripts/gh/`)

The plugin includes bash scripts that wrap the `gh` CLI. The agent calls these during conversation to manage scenarios and backlog items stored as GitHub Issues:

| Category | Scripts | Purpose |
|----------|---------|---------|
| **Scenarios** | `scenario-capture.sh`, `scenario-advance.sh`, `scenario-question.sh`, `scenario-resolve.sh` | Manage scenarios through the maturity pipeline |
| **Scenarios** | `scenario-list.sh`, `scenario-get.sh` | List and inspect scenarios |
| **Backlog** | `backlog-create.sh`, `backlog-list.sh`, `backlog-update.sh`, `backlog-close.sh` | Track work items that drive scenario creation |
| **Setup** | `setup-labels.sh` | One-time repository label configuration |

Domain information (vocabulary, adapters, test structure) comes from reading your source files directly — there is no separate server or database.

Tests run via `pnpm exec aver run` (or `npx aver run`).

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

**Agent:** Runs `scenario-capture.sh` with the behavior. Asks: "Is this one scenario or multiple? I see at least: request reset, receive email, set new password, expired token handling."

**You:** "That's four scenarios. Capture them all."

**Agent:** Captures four scenarios as GitHub Issues. Runs `scenario-list.sh` to see what's ready. Starts an Example Mapping session for the first one.

**Agent:** "For 'request password reset' — here are the rules I see: (1) must provide a registered email, (2) sends a reset link, (3) link expires after 24 hours. Any rules I'm missing? Any questions?"

**You:** "What happens if the email doesn't exist? We probably shouldn't reveal that."

**Agent:** Runs `scenario-question.sh` with that question. "Good catch — should we return the same success message regardless of whether the email exists?"

**You:** "Yes, same message either way."

**Agent:** Runs `scenario-resolve.sh`, updates the rules, proposes vocabulary: `requestReset` action, `resetEmailSent` assertion, `resetDenied` assertion. Asks for approval.

**You:** "Call it `requestPasswordReset` — be explicit."

**Agent:** Updates, advances to `specified`, then starts TDD implementation using `pnpm exec aver run` in a loop until all tests pass.

The agent runs gh scripts throughout — you see the commands in the conversation and can intervene at any point. Since scenarios are GitHub Issues, you can also view and edit them directly on GitHub.

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

## Managing scenarios outside agent sessions

Since scenarios and backlog items are GitHub Issues, you can manage them with any tool that works with GitHub:

```bash
# List scenarios
gh issue list --label scenario

# View a scenario
gh issue view 42

# List backlog items by priority
gh issue list --label backlog --label P0

# Or use the convenience scripts directly
./node_modules/@averspec/agent-plugin/scripts/gh/scenario-list.sh
./node_modules/@averspec/agent-plugin/scripts/gh/backlog-list.sh
```
