---
title: "AI-Assisted Testing"
---

## The outer loop and the inner loop

BDD has always worked in two loops. The outer loop is the acceptance test — a behavioral specification that stays red while you build. The inner loop is TDD — red, green, refactor on the code underneath until the outer loop goes green.

AI coding agents fit naturally into the inner loop. They're good at generating code, running tests, and iterating until something passes. But the outer loop — deciding *what* the system should do, naming the vocabulary, choosing what to test — that's where human judgment matters. An agent that writes code against a vague prompt can produce something that works and is completely wrong. An agent that implements code against a domain-driven acceptance test can only succeed by making the spec pass.

Aver gives you a way to write that outer loop as executable specs. The human defines the domain vocabulary and writes acceptance tests in business language. The agent implements adapters and production code until `aver run` passes. The spec is the constraint. The agent works within it.

This is the collaboration model described in [Stop Reviewing AI Code](/articles/stop-reviewing/) and [The Foundation Nobody's Building](/articles/the-foundation/) — move verification from code review to the test runner.

## Using Aver with any agent

Any agent that can run shell commands can use Aver as a verification layer. Define your domain, write your acceptance tests, and let the agent implement until `aver run` passes. This works with Claude Code, Cursor, Cline, Aider, or anything that can run tests.

If that's all you need, stop here. Everything below adds structured workflow and scenario management on top via a Claude Code plugin.

---

## Setting up the Claude Code plugin

The `@averspec/agent-plugin` bundles two agent skills and a set of bash scripts for managing scenarios and backlog. Install it:

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

### 2. Choose a backend

The plugin supports two backends for scenario and backlog tracking. Set `AVER_BACKEND` to choose which one the scripts use. Add it to your project `.env`, `~/.config/aver/.env`, or your Claude Code settings (`env` field):

```
AVER_BACKEND=gh      # GitHub Issues (default if unset)
AVER_BACKEND=linear  # Linear
```

#### GitHub Issues (default)

Requires the `gh` CLI, authenticated to the repository:

```bash
# Verify authentication
gh auth status

# Run label setup once per repository
./node_modules/@averspec/agent-plugin/scripts/gh/setup-labels.sh
```

This creates the `scenario`, `backlog`, `stage:captured`, `stage:characterized`, `stage:mapped`, `stage:specified`, `stage:implemented`, and priority/type labels that the scripts use to track scenarios and backlog items as GitHub Issues.

Add script permissions to `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": ["Bash(node_modules/@averspec/agent-plugin/scripts/gh/*)"]
  }
}
```

#### Linear

Requires a [Linear API key](https://linear.app/settings/api). Run the interactive setup:

```bash
npx @averspec/agent-plugin setup
```

This will prompt for your API key, let you select your team, save credentials to `~/.config/aver/.env`, and optionally create the required labels in Linear.

Alternatively, create `~/.config/aver/.env` (or `.env` in your project root) manually:

```
LINEAR_API_KEY=lin_api_...
LINEAR_TEAM_ID=YOUR_TEAM_KEY
```

Set the backend and add script permissions to `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": ["Bash(node_modules/@averspec/agent-plugin/scripts/linear/*)"]
  }
}
```

### 3. Verify

Start Claude Code in your project and ask it to run `/aver:aver-workflow`. It should load the skill and orient itself by reading your domain and adapter files.

---

## What you get

### Bash scripts

The plugin includes bash scripts in `scripts/gh/` and `scripts/linear/`. Both backends expose the same script names with the same arguments. The agent calls these during conversation to manage scenarios and backlog items:

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

See the [Scenario Pipeline guide](/guides/scenario-pipeline/) for the methodology behind these stages.

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

Scenarios and backlog items live in your chosen backend, so you can manage them outside of agent sessions.

**GitHub Issues:**

```bash
gh issue list --label scenario
gh issue view 42
gh issue list --label backlog --label P0
```

**Linear:** Use the Linear app or API directly.

**Either backend:**

```bash
./node_modules/@averspec/agent-plugin/scripts/gh/scenario-list.sh
./node_modules/@averspec/agent-plugin/scripts/linear/scenario-list.sh
```
