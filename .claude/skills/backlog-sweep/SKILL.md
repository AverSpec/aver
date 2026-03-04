---
name: backlog-sweep
description: Triage plan docs into the aver backlog, then execute backlog items in priority waves
---

# Backlog Sweep

Crawl plan and decision documents for actionable items, import them into the aver MCP backlog, then optionally execute items in priority-ordered waves.

Two phases: **Triage** (always runs) then **Execute** (opt-in).

## Phase 1: Triage

### Step 1 — Establish baseline

Call `get_backlog_summary` and `get_backlog_items(status: 'open')` to show the current backlog state.

### Step 2 — List plan documents

Glob for plan docs in both locations:
- `.aver/plans/*.md`
- `docs/plans/*.md`

Present the full list with dates and filenames. Ask the user which docs to scan (multi-select). If the user says "all", scan everything.

### Step 3 — Extract actionable items

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

### Step 4 — Dedup against existing backlog

Compare extracted items against existing backlog items by title and description similarity. Filter out items that are clearly already tracked. Flag near-matches for the user to decide.

### Step 5 — Present candidates for approval

Show each candidate with its proposed metadata. The user can:
- Approve as-is
- Adjust priority, type, or tags
- Skip / reject items
- Merge items that are duplicates

### Step 6 — Import approved items

For each approved item, call `create_backlog_item` with the finalized metadata including the `references` array linking back to the source document.

### Step 7 — Show updated backlog

Call `get_backlog_summary` to show the new state. Highlight what was added.

Ask: **"Want to execute a wave, or stop here?"**

If the user says stop, end the skill. If they want to execute, proceed to Phase 2.

## Phase 2: Execute

### Step 1 — Present the backlog

Call `get_backlog_items(status: 'open')` and group by priority (P0 first, then P1, etc.).

Show the grouped list. Ask the user which priority tier or specific items to tackle in this wave.

### Step 2 — Execution strategy

Ask the user: **"How should we execute this wave?"**

- **Sequential**: Work through items one at a time in priority order (safest, uses current session).
- **Parallel (in-session)**: Dispatch subagents via the Agent tool. Good for 2-4 items touching non-overlapping files.
- **Headless (fire-and-forget)**: Invoke the `/headless-dispatch` skill — spawns independent `claude -p` processes, each in its own worktree. Best for larger waves.

### Step 3 — Execute items (sequential / in-session parallel)

For each item in the wave:

1. Mark `in-progress` via `update_backlog_item`
2. Implement the fix/feature
3. Run tests to verify (`run_tests` or `pnpm exec aver run`)
4. Commit separately — message should reference the backlog item title
5. Mark `done` via `update_backlog_item`

If an item gets blocked after 2 attempts, mark it with a note describing the blocker and move on.

### Step 4 — Push and verify

After the wave completes:
1. Push to remote
2. Verify CI passes
3. If CI fails, diagnose and fix before proceeding

### Step 5 — Summary

Report:
- Items completed in this wave
- Items blocked (with reasons)
- Remaining open backlog items
- Ask: **"Run another wave?"**

## Rules

- **Never auto-import** — always present candidates for user approval
- **Never auto-execute** — always ask before starting a wave
- **Commit per item** — one commit per backlog item, not a batch commit
- **Dedup rigorously** — don't create duplicate backlog items
- **Reference sources** — every imported item links back to the doc it came from
- **Parallel safety** — when dispatching subagents, verify worktree isolation. Each agent must confirm its working directory before making changes.

## MCP Tools Used

| Tool | Phase | Purpose |
|------|-------|---------|
| `get_backlog_summary` | Triage | Baseline counts |
| `get_backlog_items` | Both | List items with filters |
| `create_backlog_item` | Triage | Import new items |
| `update_backlog_item` | Execute | Mark in-progress / done |
| `run_tests` | Execute | Verify after implementation |
