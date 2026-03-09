---
layout: default
title: Workspace CLI
parent: Guides
nav_order: 8
---

# Workspace CLI

The `aver workspace` command manages a **scenario workspace** -- a local store of behaviors that move through a maturity pipeline from initial capture to full implementation. It is the CLI counterpart to the MCP workspace tools.

## Install

The workspace is part of `@aver/workspace`, which the core CLI imports dynamically. It's included when you install the agent plugin:

```bash
npm install --save-dev @aver/agent-plugin
```

## Storage

Workspace data is stored in a SQLite database at `.aver/workspace/` in your project directory.

## The Stage Pipeline

Every scenario progresses through five stages:

```
captured -> characterized -> mapped -> specified -> implemented
```

| Stage | Meaning |
|:------|:--------|
| **captured** | Raw behavior observed or intended, not yet investigated |
| **characterized** | Investigated -- code paths traced, seams and constraints identified |
| **mapped** | Confirmed by a human perspective; rules and examples attached |
| **specified** | All questions resolved; ready for domain vocabulary and adapter design |
| **implemented** | Linked to domain operations and/or test names in the codebase |

Advancement between stages enforces hard blocks:

- **characterized to mapped** -- requires `confirmedBy` (human must confirm intent)
- **mapped to specified** -- all open questions must be resolved
- **specified to implemented** -- requires at least one domain link (`domainOperation` or `testNames`)

## Commands

### `aver workspace status`

Show a summary of the workspace: scenario counts per stage, the detected workflow phase, and recommended next actions.

```bash
aver workspace status
```

```
Workspace: my-project
Phase: Investigation (3 captured scenario(s) recorded. Continue exploring the system.)

  Captured: 3
  Characterized: 0
  Mapped: 0
  Specified: 0
  Implemented: 0
  Total: 3
  Open questions: 0

Recommended actions:
  - Explore more system behaviors and capture scenarios
  - Investigate captured scenarios: trace code paths, find seams
  - Advance characterized scenarios with context and rationale
```

### `aver workspace capture`

Record a new scenario at the `captured` stage.

```bash
aver workspace capture "Users can reset their password via email" \
  --context "Password reset flow" \
  --story "Account recovery" \
  --mode intended
```

| Option | Description |
|:-------|:-----------|
| `--context` | Where the behavior was observed or is intended |
| `--story` | Feature or story this behavior belongs to |
| `--mode` | `observed` (default) or `intended` |

### `aver workspace advance`

Move a scenario to the next stage in the pipeline.

```bash
aver workspace advance a1b2c3d4 \
  --rationale "Code paths traced, seams identified in AuthService" \
  --by "developer"
```

| Option | Required | Description |
|:-------|:---------|:-----------|
| `--rationale` | Yes | Why this scenario is ready to advance |
| `--by` | Yes | Perspective promoting the scenario (e.g. `developer`, `product`, `tester`) |

Advancement may be blocked if prerequisites are not met (see hard blocks above). Warnings are printed for advisory issues but do not prevent advancement.

### `aver workspace revisit`

Move a scenario back to an earlier stage when new information invalidates previous work.

```bash
aver workspace revisit a1b2c3d4 \
  --to captured \
  --rationale "Found additional edge cases that change the behavior"
```

| Option | Required | Description |
|:-------|:---------|:-----------|
| `--to` | Yes | Target stage to revisit to (must be earlier than current) |
| `--rationale` | Yes | Why this scenario needs to go back |

### `aver workspace scenarios`

List scenarios with optional filters.

```bash
# List all scenarios
aver workspace scenarios

# Filter by stage
aver workspace scenarios --stage captured

# Search by keyword (matches behavior and context)
aver workspace scenarios --keyword "password"
```

Output is a table:

```
ID         Stage          Behavior
---------- -------------- ----------------------------------------
a1b2c3d4   captured       Users can reset their password via email
e5f6g7h8   characterized  Login rate limiting after 5 attempts

2 scenario(s)
```

### `aver workspace export`

Export the workspace as markdown or JSON.

```bash
# Print markdown to stdout
aver workspace export

# Export as JSON to a file
aver workspace export --format json --file workspace-snapshot.json
```

| Option | Description |
|:-------|:-----------|
| `--format` | `md` (default) or `json` |
| `--file` | Write to a file instead of stdout |

### `aver workspace import`

Import scenarios from a JSON file. Scenarios with duplicate IDs are skipped.

```bash
aver workspace import workspace-snapshot.json
```

```
Import complete: 5 added, 2 skipped
```

## Workflow Phases

The `status` command auto-detects the current workflow phase based on scenario distribution:

| Phase | Condition |
|:------|:----------|
| **kickoff** | No scenarios exist yet |
| **investigation** | Captured scenarios present, none implemented |
| **mapping** | Characterized scenarios need business confirmation |
| **specification** | Mapped scenarios ready for vocabulary design |
| **implementation** | Specified scenarios need domain code and tests |
| **verification** | All scenarios implemented with domain links |
| **discovery** | New captured scenarios alongside existing implemented ones |

Each phase includes recommended actions to guide what to do next.
