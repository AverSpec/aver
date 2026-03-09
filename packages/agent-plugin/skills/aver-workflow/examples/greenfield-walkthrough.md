# Walkthrough: Greenfield Feature (Task Cancellation)

New features skip investigation/characterization: `captured` -> `mapped` -> `specified` -> `implemented`.

**Scenario:** Add task cancellation to an existing task-board. Cancelled tasks remain visible but frozen.

---

## 1. Capture Intent

```bash
// Run: scenario-capture.sh --title "Users can cancel a task, making it visible but frozen"
//   (body includes context: Human requested feature addition to task-board domain, mode: intended)
// -> creates issue #1, stage: captured
```

## 2. Scenario Mapping

```bash
// Read the domain source file for task-board vocabulary
// -> actions: createTask, deleteTask, moveTask, assignTask
//    assertions: taskInStatus, taskAssignedTo, taskCount
```

**Rules:**
1. A task can be cancelled (status "cancelled")
2. Cancelled tasks cannot be moved or reassigned
3. Cancelled tasks still appear in queries
4. Cancelling an already-cancelled task is idempotent
5. Un-cancelling restores to "todo"

```bash
// Run: scenario-question.sh 1 --body "Un-cancel: restore original status or always reset to 'todo'?"
// Human: "Always reset to 'todo'."
// Run: scenario-resolve.sh 1 --comment-id <id> --body "Always resets to 'todo', regardless of previous status."
```

| Rule | Given | When | Then |
|------|-------|------|------|
| Cancel | Task in "todo" | cancelTask | Status is "cancelled" |
| Cannot move | Task cancelled | moveTask | Error: task is cancelled |
| Cannot reassign | Task cancelled | assignTask | Error: task is cancelled |
| Visible | Task cancelled | tasksByStatus("cancelled") | Returns the task |
| Idempotent | Already cancelled | cancelTask again | Still cancelled |
| Un-cancel | Task cancelled | uncancelTask | Status is "todo" |

```bash
// Run: scenario-advance.sh 1 --to mapped
//   (comment includes rationale: Example Mapping complete. 5 rules, 6 examples.
//    Question resolved. Human confirmed.)
// -> issue #1 label updated to stage:mapped
```

## 3. Specification

**Agent:** "Adding: actions `cancelTask`, `uncancelTask`; assertions `taskIsCancelled`, `actionRejected`. Names work?"

**Human:** "Yes."

```bash
// Run: scenario-advance.sh 1 --to specified
//   (comment includes rationale: Vocabulary confirmed: cancelTask, uncancelTask,
//    taskIsCancelled, actionRejected.)
// -> issue #1 label updated to stage:specified
```

## 4. Handoff

Dispatch to TDD skill. Subagent writes domain additions, tests, and adapters.

```bash
// Run: pnpm exec aver run   -> 11 passed, 0 failed

// Run: gh issue edit 1 --body "..."
//   (update Domain Link section: taskBoard.cancelTask ->
//    "cancel a task", "cancelled task cannot be moved",
//    "cancelled task cannot be reassigned", "cancelling already cancelled is idempotent",
//    "un-cancel restores task to todo", "cancelled task appears in cancelled count")
```

**Agent:** "11 tests passing (5 existing + 6 new). No regressions. All scenarios linked."

---

## Key Takeaways

1. **Greenfield skips characterization** -- Intent is known upfront.
2. **Example Mapping drives tests** -- Each rule produces examples, each example becomes a test.
3. **Questions surface edge cases** -- Un-cancel behavior clarified before implementation.
4. **Existing tests stay green** -- New operations extend without breaking.
