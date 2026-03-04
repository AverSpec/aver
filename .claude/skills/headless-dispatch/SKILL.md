---
name: headless-dispatch
description: Spawn independent claude -p workers in worktrees for fire-and-forget parallel execution
---

# Headless Dispatch

Spawn independent Claude Code processes via `claude -p` with git worktrees for isolation. Each worker runs unmonitored in its own worktree, commits its changes, and reports back via log files.

Use this skill when you have 2+ independent tasks that benefit from full process isolation — each worker gets its own context window, worktree, and can run simultaneously.

## When to use this vs in-session subagents

| Approach | Best for | Trade-off |
|----------|----------|-----------|
| **Agent tool** | 2-4 small tasks, need results in current session | Shares context window budget |
| **Headless dispatch** | 3+ substantial tasks, fire-and-forget | No live monitoring, must review after |

## Step 1 — Prepare the task list

For each task, define:
- **id**: short identifier (used for worktree name and log file)
- **prompt**: self-contained instructions (the worker has NO shared context)
- **model**: which model to use (default: `sonnet`)
- **relevant files**: key paths the worker needs to know about

The prompt must be fully self-contained. Include:
- What to implement / fix / research
- Relevant file paths and package names
- How to run tests
- Commit message format
- What to do if blocked

## Step 2 — Form the commands

Use a lightweight model (haiku) to draft the prompts. For each task, build a command:

```bash
claude -p "<prompt>" \
  --worktree "<task-id>" \
  --model sonnet \
  --allowedTools "Bash,Edit,Read,Write,Grep,Glob,Agent" \
  --permission-mode bypassPermissions \
  --print \
  --no-session-persistence \
  > /tmp/claude/headless-<task-id>.log 2>&1 &
```

Present the commands to the user for approval before executing.

## Step 3 — Launch workers

After user approval, execute the commands. Track each worker:

```bash
# Store PIDs
echo "<pid> <task-id>" >> /tmp/claude/headless-pids.txt
```

Report: "Launched N workers. Check progress with `/headless-dispatch status`."

## Step 4 — Monitor

Check worker status:

```bash
# Check if a worker is still running
kill -0 <pid> 2>/dev/null && echo "running" || echo "done"

# Tail a worker's log
tail -30 /tmp/claude/headless-<task-id>.log

# Check for blocker files
cat /tmp/claude/headless-<task-id>-blocked.txt 2>/dev/null
```

The user can ask to check status at any time. Show a summary table:

| Task | Status | Last log line |
|------|--------|---------------|
| fix-auth | running | "Running test suite..." |
| add-retry | done | "All tests pass, committed." |
| refactor-api | blocked | "Cannot resolve circular dependency" |

## Step 5 — Merge results

Once all workers finish:

1. **List worktree branches** with their commits:
   ```bash
   git -C .claude/worktrees/<task-id> log --oneline -5
   ```

2. **Review diffs** — show the user what each worker changed:
   ```bash
   git diff main...<worktree-branch>
   ```

3. **Merge one at a time** — for each approved worktree:
   ```bash
   git merge <worktree-branch>
   ```

4. **Run tests between merges** — full suite after each merge to catch conflicts early

5. **Push** after all merges pass

6. **Clean up worktrees**:
   ```bash
   git worktree remove .claude/worktrees/<task-id>
   ```

## Prompt template

```
You are working on task: "<title>"

<description>

Your instructions:
1. Implement the change described above
2. Run tests: <test-command>
3. If tests pass, commit with message: "<commit-message>"
4. Do NOT push — the orchestrator will merge and push

Relevant context:
- Package: <package-name>
- Key files: <file-paths>
- Test command: <test-command>

If you get stuck after 2 attempts, write a summary of the blocker
to /tmp/claude/headless-<task-id>-blocked.txt and exit.
```

## Safety rules

- **Always use `--worktree`** — never run headless workers on the main worktree
- **Review diffs before merging** — headless workers are unmonitored, always review output
- **Run tests between merges** — don't batch-merge without verification
- **Cap concurrency at 5** — avoid resource contention
- **Log everything** — output goes to `/tmp/claude/headless-<task-id>.log`
- **User approves commands** — present the `claude -p` commands before executing
- **No push from workers** — only the orchestrator pushes after review
