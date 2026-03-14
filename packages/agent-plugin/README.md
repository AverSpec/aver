# @averspec/agent-plugin

> **Status: Experimental** — API may change between minor versions.

Agent plugin for [Aver](https://github.com/averspec/aver) — domain-driven acceptance testing.

## What's Included

- **Skills** — `aver-workflow` facilitates scenario mapping and domain design (5-stage pipeline: captured → characterized → mapped → specified → implemented). `telemetry` augments the workflow with OTel observability patterns.
- **Scripts** — Bash scripts for managing scenarios and backlog items, with pluggable backends (GitHub Issues or Linear).

## Installation

Register the plugin in `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": ["Bash(packages/agent-plugin/scripts/gh/*)"]
  }
}
```

## Backend Setup

The plugin supports two backends for scenario and backlog tracking. Set `AVER_BACKEND` to choose (defaults to `gh`).

### GitHub Issues (default)

Requires the `gh` CLI authenticated:

```bash
gh auth status
```

Run label setup once per repository:

```bash
packages/agent-plugin/scripts/gh/setup-labels.sh
```

### Linear

Run the interactive setup:

```bash
npx @averspec/agent-plugin setup
```

This will:
1. Prompt for your [Linear API key](https://linear.app/settings/api)
2. Let you select your team
3. Save credentials to `~/.config/aver/.env`
4. Optionally create the required labels in Linear

**Manual setup:** Create `~/.config/aver/.env` (or `.env` in your project root):

```
LINEAR_API_KEY=lin_api_...
LINEAR_TEAM_ID=YOUR_TEAM_KEY
```

Credential lookup order: environment variables → `.env` in cwd → `~/.config/aver/.env`.

Update your Claude settings to allow Linear scripts:

```json
{
  "permissions": {
    "allow": ["Bash(packages/agent-plugin/scripts/linear/*)"]
  }
}
```

## Usage

Once installed, Claude Code can:

1. Follow the scenario mapping workflow when adding features
2. Manage scenarios and backlog items via scripts
3. Use `/aver:aver-workflow` to invoke the skill directly

## Scripts

Both backends expose the same script interface.

### Scenario Scripts

| Script | Description |
|--------|-------------|
| `scenario-capture.sh` | Capture a new scenario |
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

### Setup Scripts

| Script | Description |
|--------|-------------|
| `setup-labels.sh` | Create required labels (idempotent) |
| `setup.sh` *(Linear only)* | Interactive credential + label setup |

## Requirements

- Node.js >= 18
- **GitHub backend:** `gh` CLI authenticated (`gh auth status`)
- **Linear backend:** Linear API key ([create one here](https://linear.app/settings/api))
