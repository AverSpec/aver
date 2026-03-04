---
name: backlog-sweep
description: Crawl plan and decision docs for actionable items and import them into the aver MCP backlog
---

# Backlog Sweep

Crawl plan and decision documents for actionable items, dedup against the existing backlog, and import approved items via the aver MCP tools.

This skill is triage only — it populates the backlog. To execute items, use `/backlog-wave`.

## Step 1 — Establish baseline

Call `get_backlog_summary` and `get_backlog_items(status: 'open')` to show the current backlog state.

## Step 2 — List plan documents

Glob for plan docs in both locations:
- `.aver/plans/*.md`
- `docs/plans/*.md`

Present the full list with dates and filenames. Ask the user which docs to scan (multi-select). If the user says "all", scan everything.

## Step 3 — Extract actionable items

For each selected doc, read the full content and extract:
- Explicit TODOs and action items
- Phrases like "we should", "needs", "must", "consider"
- Unresolved decisions or open questions
- Proposed features or improvements not yet tracked
- Deferred work ("later", "future", "post-v1", "stretch goal")

For each extracted item, draft:
- **title**: concise imperative (e.g., "Add retry logic to judge provider")
- **type**: feature | bug | research | refactor | chore
- **priority**: P0–P3 (use context clues — "critical" → P0, "nice to have" → P3)
- **tags**: relevant categories
- **reference**: `{ label: "<doc filename>", path: "<doc path>" }`

## Step 4 — Dedup against existing backlog

Compare extracted items against existing backlog items by title and description similarity. Filter out items that are clearly already tracked. Flag near-matches for the user to decide.

## Step 5 — Present candidates for approval

Show each candidate with its proposed metadata. The user can:
- Approve as-is
- Adjust priority, type, or tags
- Skip / reject items
- Merge items that are duplicates

## Step 6 — Import approved items

For each approved item, call `create_backlog_item` with the finalized metadata including the `references` array linking back to the source document.

## Step 7 — Show updated backlog

Call `get_backlog_summary` to show the new state. Highlight what was added.

Suggest: **"Run `/backlog-wave` to start executing items."**

## Rules

- **Never auto-import** — always present candidates for user approval
- **Dedup rigorously** — don't create duplicate backlog items
- **Reference sources** — every imported item links back to the doc it came from

## MCP Tools Used

| Tool | Purpose |
|------|---------|
| `get_backlog_summary` | Baseline counts |
| `get_backlog_items` | List existing items for dedup |
| `create_backlog_item` | Import new items |
