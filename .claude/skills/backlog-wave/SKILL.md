---
name: backlog-wave
description: Execute backlog items in priority-based waves (Urgent → High → Medium → Low) with checkpoints between waves
---

# Backlog Wave

Execute open backlog items in priority-ordered waves. Each wave completes fully (implement, commit, push, CI green) before the next begins.

Use `/backlog-sweep` first to populate the backlog from plan docs if needed.

## Modes

This skill has two modes:

- **Interactive** (default): Checkpoints between waves, asks for execution strategy, user approves each step.
- **Autonomous**: Runs all waves end-to-end without pausing. Parallelizes where possible, falls back to sequential when items have dependencies. Reports a full summary at the end.

The user selects the mode at the start. If they say "clear the backlog" or "run all waves" without asking for input, use autonomous mode.

---

## Ticket Lifecycle

Tickets move through these Linear states as the skill progresses:

| Phase | State | Script |
|-------|-------|--------|
| Planning / prioritization | **Todo** | `backlog-status.sh <ID> --state todo` |
| Active implementation | **In Progress** | `backlog-status.sh <ID> --state in-progress` |
| Completed & verified | **Done** | `backlog-status.sh <ID> --state done` |
| Blocked / deferred | stays current | add a note via `backlog-update.sh` |

**Transition tickets at each phase boundary** — don't skip states.

---

## Interactive Mode

### Step 1 — Load and priority-sort the backlog

Run `bash packages/agent-plugin/scripts/linear/backlog-list.sh --status open` to fetch all open items.

Group by priority tier and sort within each tier by impact:

```
Wave 1 (Urgent): <items>  — blockers, ship-stopping
Wave 2 (High):   <items>  — important, pre-release
Wave 3 (Medium): <items>  — nice-to-have
Wave 4 (Low):    <items>  — low priority
```

**Priority sorting within a wave**: When items share a priority tier, sort by:
1. **Dependencies first** — if item B depends on item A's changes, A goes first
2. **Type weight** — bugs > refactors > features > chores > research
3. **Effort** — smaller items first (quick wins build momentum)
4. **Impact** — items touching public API or user-facing behavior rank higher

Present the sorted list with recommended execution order. Ask: **"Start with Wave 1 (Urgent)? Or pick a different starting wave?"**

The user can also cherry-pick specific items across priorities into a custom wave.

### Step 2 — Move wave items to Todo

For each item selected for the current wave:

```bash
bash packages/agent-plugin/scripts/linear/backlog-status.sh <ID> --state todo
```

This signals the wave is planned and these items are queued for work.

### Step 3 — Execution strategy for this wave

Ask the user: **"How should we execute this wave?"**

- **Sequential**: Work through items one at a time (safest, uses current session).
- **Parallel (in-session)**: Dispatch subagents via the Agent tool with worktree isolation. Good for 2-4 items touching non-overlapping files. See **Subagent Isolation Protocol** below.
- **Headless (fire-and-forget)**: Invoke the `/headless-dispatch` skill — spawns independent `claude -p` processes, each in its own worktree. Best for larger waves.

### Step 4 — Execute items

**Sequential**: For each item in the wave:

1. Move to **In Progress**:
   ```bash
   bash packages/agent-plugin/scripts/linear/backlog-status.sh <ID> --state in-progress
   ```
2. Implement the fix/feature
3. Run tests to verify (`pnpm test` or `pnpm exec aver run`)
4. Commit separately — message should reference the backlog item ID and title
5. Move to **Done**:
   ```bash
   bash packages/agent-plugin/scripts/linear/backlog-status.sh <ID> --state done
   ```

**Parallel**: Follow the **Subagent Isolation Protocol** below. Each agent implements, tests, and commits. The orchestrator handles status transitions:
- Move all items to **In Progress** before dispatching agents
- Move each to **Done** after its worktree branch is successfully merged

If an item gets blocked after 2 attempts, add a note via `backlog-update.sh` describing the blocker and move on. Leave it in its current state.

### Step 5 — Push and verify

After the wave completes:
1. Push to remote
2. Verify CI passes
3. If CI fails, diagnose and fix before proceeding

### Step 6 — Wave checkpoint

Report:
- Wave N complete: X items done, Y blocked
- Remaining waves: list priority tiers still open
- Ask: **"Proceed to Wave N+1 (<priority>), or stop here?"**

Repeat from Step 2 for the next wave until all waves are done or the user stops.

## Subagent Isolation Protocol

When dispatching parallel in-session subagents, follow this protocol exactly:

1. **Launch each subagent with `isolation: "worktree"`** on the Agent tool call. This creates a git worktree automatically — do NOT manually create worktrees or tell agents to `cd`.
2. **Each subagent must commit its own work** in its worktree branch before finishing. The agent's prompt must include:
   - Implement the change and run tests
   - `git add` the relevant files and `git commit` with a message referencing the backlog item title
   - Report the commit hash and branch name in its result
3. **The orchestrator only merges** — after all agents complete:
   - For each worktree branch, merge to main one at a time
   - Run the full test suite between merges
   - Do NOT pluck files from worktrees or re-commit work that agents already committed

### Recovery

- If a merge breaks tests, **revert the merge** and report the failure — do not proceed to the next merge
- If worktree isolation fails entirely, fall back to sequential execution on main

---

## Autonomous Mode

Run all waves end-to-end without pausing for input.

### Filtering for autonomy

Before executing, assess each backlog item for autonomous suitability. **Only include items that don't require user decisions**:

- **Include**: bugs with clear reproduction, refactors with defined scope, chores (dependency updates, linting), features with unambiguous specs
- **Defer**: research items, items with open questions, features requiring design choices, anything tagged `needs-discussion`
- **Defer**: items of type `research` — these inherently need human judgment

Present the split: "I can autonomously handle X items. Y items need your input — deferring those."

### Procedure

1. Run `bash packages/agent-plugin/scripts/linear/backlog-list.sh --status open`, filter for autonomous suitability, and group by priority (Urgent first). Apply priority sorting rules from Step 1 above.
2. Move all selected items to **Todo**:
   ```bash
   bash packages/agent-plugin/scripts/linear/backlog-status.sh <ID> --state todo
   ```
3. For each priority wave:
   - List the items and execution order
   - Move items to **In Progress** before starting work
   - For items that can be parallelized (no file dependencies), dispatch subagents with `isolation: "worktree"` — one per item. Each agent must write tests, implement, verify the suite passes, and **commit its own work** in the worktree branch
   - For items with dependencies, execute sequentially
   - After all subagents complete, merge each worktree branch to main one at a time, running the full test suite between merges
   - Move each completed item to **Done**
   - Push and verify CI
   - Move to the next priority wave
4. If any item fails after 2 attempts, mark it blocked with a note and continue
5. At the end, report a wave-by-wave summary:

```
## Wave Summary

### Wave 1 (Urgent)
- [done] <item title> — <commit hash>
- [blocked] <item title> — <reason>

### Wave 2 (High)
- [done] <item title> — <commit hash>

## Totals
Shipped: X items
Blocked: Y items
Remaining: Z items
```

### Decision-making in autonomous mode

- If you hit an ambiguity, make the simplest reasonable choice and document it in a code comment
- If a test fails for the wrong reason, fix the test infrastructure first
- If parallelized items conflict at merge time, revert the later merge and re-execute sequentially
- Track all decisions for the final summary

## Rules

- **Interactive mode**: always ask before starting a wave, checkpoint between waves
- **Autonomous mode**: run all waves without pausing, report at the end
- **Commit per item** — one commit per backlog item, not a batch commit
- **Parallel safety** — always use worktree isolation for parallel execution
- **Always transition ticket state** — Todo → In Progress → Done

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `backlog-list.sh --status open` | List open items grouped by priority |
| `backlog-status.sh <ID> --state <state>` | Transition ticket: `todo`, `in-progress`, `done` |
| `backlog-close.sh <ID>` | Close a ticket (alternative to `--state done`) |
| `backlog-update.sh <ID> --body "..."` | Add notes (e.g., blocker description) |
| `backlog-create.sh --title "..." --priority high` | Create new backlog items |

All scripts are at `packages/agent-plugin/scripts/linear/`.
