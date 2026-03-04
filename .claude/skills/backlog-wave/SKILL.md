---
name: backlog-wave
description: Execute backlog items in priority-based waves (P0 → P1 → P2 → P3) with checkpoints between waves
---

# Backlog Wave

Execute open backlog items in priority-ordered waves. Each wave completes fully (implement, commit, push, CI green) before the next begins.

Use `/backlog-sweep` first to populate the backlog from plan docs if needed.

## Step 1 — Present the backlog by wave

Call `get_backlog_items(status: 'open')` and group by priority:

```
Wave 1 (P0): <items>
Wave 2 (P1): <items>
Wave 3 (P2): <items>
Wave 4 (P3): <items>
```

Show the grouped list. Ask: **"Start with Wave 1 (P0)? Or pick a different starting wave?"**

The user can also cherry-pick specific items across priorities into a custom wave.

## Step 2 — Execution strategy for this wave

Ask the user: **"How should we execute this wave?"**

- **Sequential**: Work through items one at a time (safest, uses current session).
- **Parallel (in-session)**: Dispatch subagents via the Agent tool with worktree isolation. Good for 2-4 items touching non-overlapping files. See **Subagent Isolation Protocol** below.
- **Headless (fire-and-forget)**: Invoke the `/headless-dispatch` skill — spawns independent `claude -p` processes, each in its own worktree. Best for larger waves.

## Step 3 — Execute items

For each item in the wave:

1. Mark `in-progress` via `update_backlog_item`
2. Implement the fix/feature
3. Run tests to verify (`run_tests` or `pnpm exec aver run`)
4. Commit separately — message should reference the backlog item title
5. Mark `done` via `update_backlog_item`

If an item gets blocked after 2 attempts, mark it with a note describing the blocker and move on.

## Step 4 — Push and verify

After the wave completes:
1. Push to remote
2. Verify CI passes
3. If CI fails, diagnose and fix before proceeding

## Step 5 — Wave checkpoint

Report:
- Wave N complete: X items done, Y blocked
- Remaining waves: list priority tiers still open
- Ask: **"Proceed to Wave N+1 (<priority>), or stop here?"**

Repeat from Step 2 for the next wave until all waves are done or the user stops.

## Subagent Isolation Protocol

When dispatching parallel in-session subagents, follow this protocol exactly:

1. Create subagents for each task
2. **CRITICAL**: Each agent must:
   - `cd` into its assigned worktree as the **FIRST** action
   - Run `pwd` to confirm location
   - Only then begin work
3. After all agents complete, verify each worktree has the expected changes before merging
4. Merge worktree branches to main one at a time
5. Run the full test suite between merges

### Recovery

- If an agent's changes aren't in its worktree (wrote to main instead), **kill it and retry in a fresh worktree**
- If a merge breaks tests, **revert the merge** and report the failure — do not proceed to the next merge
- If worktree isolation fails entirely, fall back to sequential execution

## Rules

- **Never auto-execute** — always ask before starting a wave
- **Commit per item** — one commit per backlog item, not a batch commit
- **Checkpoint between waves** — report results and ask before proceeding
- **Parallel safety** — always use worktree isolation for parallel execution

## MCP Tools Used

| Tool | Purpose |
|------|---------|
| `get_backlog_items` | List open items grouped by priority |
| `update_backlog_item` | Mark in-progress / done |
| `run_tests` | Verify after implementation |
| `get_backlog_summary` | Wave checkpoint reporting |
