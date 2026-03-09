# @aver/agent-plugin

> **Status: Experimental** — API may change between minor versions.

Agent plugin for [Aver](https://github.com/njackson/aver) — domain-driven acceptance testing.

## What's Included

- **Skills** — `aver-workflow` facilitates scenario mapping and domain design (5-stage pipeline: captured → characterized → mapped → specified → implemented). `telemetry` augments the workflow with OTel observability patterns.
- **Scripts** — Bash scripts wrapping `gh` CLI for managing scenarios and backlog items as GitHub Issues

## Installation

Register the plugin in `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": ["Bash(packages/agent-plugin/scripts/gh/*)"]
  }
}
```

## Setup

Run the label setup script once per repository:

```bash
packages/agent-plugin/scripts/gh/setup-labels.sh
```

## Usage

Once installed, Claude Code can:

1. Follow the scenario mapping workflow when adding features
2. Manage scenarios and backlog items as GitHub Issues via scripts
3. Use `/aver:aver-workflow` to invoke the skill directly

## Scripts

### Scenario Scripts

| Script | Description |
|--------|-------------|
| `scenario-capture.sh` | Capture a new scenario as a GitHub Issue |
| `scenario-list.sh` | List scenarios, filter by stage or keyword |
| `scenario-get.sh` | Get full details for a scenario |
| `scenario-advance.sh` | Move scenario to the next pipeline stage |
| `scenario-question.sh` | Attach an open question to a scenario |
| `scenario-resolve.sh` | Mark a question as resolved |

### Backlog Scripts

| Script | Description |
|--------|-------------|
| `backlog-create.sh` | Create a new backlog item |
| `backlog-list.sh` | List backlog items with filters |
| `backlog-update.sh` | Update labels, title, or body |
| `backlog-close.sh` | Close a backlog item |

## Requirements

- Node.js >= 18
- An Aver project with `aver.config.ts`
- `gh` CLI authenticated (`gh auth status`)
