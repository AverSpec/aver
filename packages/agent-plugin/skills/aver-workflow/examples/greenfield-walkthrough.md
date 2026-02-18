# Walkthrough: Greenfield Feature (Task Cancellation)

New features skip investigation/characterization: `captured` -> `mapped` -> `specified` -> `implemented`.

**Scenario:** Add task cancellation to an existing task-board. Cancelled tasks remain visible but frozen.

---

## 1. Capture Intent

```json
// Tool: capture_scenario
{ "behavior": "Users can cancel a task, making it visible but frozen",
  "context": "Human requested feature addition to task-board domain",
  "mode": "intended" }
// -> { "id": "sc_001", "stage": "captured" }
```

## 2. Scenario Mapping

```json
// Tool: get_domain_vocabulary { "domain": "task-board" }
// -> actions: createTask, deleteTask, moveTask, assignTask
//    assertions: taskInStatus, taskAssignedTo, taskCount
```

**Rules:**
1. A task can be cancelled (status "cancelled")
2. Cancelled tasks cannot be moved or reassigned
3. Cancelled tasks still appear in queries
4. Cancelling an already-cancelled task is idempotent
5. Un-cancelling restores to "todo"

```json
// Tool: add_question
{ "scenarioId": "sc_001",
  "text": "Un-cancel: restore original status or always reset to 'todo'?" }
// Human: "Always reset to 'todo'."
// Tool: resolve_question
{ "scenarioId": "sc_001", "questionId": "q_001",
  "answer": "Always resets to 'todo', regardless of previous status." }
```

| Rule | Given | When | Then |
|------|-------|------|------|
| Cancel | Task in "todo" | cancelTask | Status is "cancelled" |
| Cannot move | Task cancelled | moveTask | Error: task is cancelled |
| Cannot reassign | Task cancelled | assignTask | Error: task is cancelled |
| Visible | Task cancelled | tasksByStatus("cancelled") | Returns the task |
| Idempotent | Already cancelled | cancelTask again | Still cancelled |
| Un-cancel | Task cancelled | uncancelTask | Status is "todo" |

```json
// Tool: advance_scenario
{ "id": "sc_001",
  "rationale": "Example Mapping complete. 5 rules, 6 examples. Question resolved. Human confirmed.",
  "promotedBy": "agent" }
// -> { "stage": "mapped" }
```

## 3. Specification

**Agent:** "Adding: actions `cancelTask`, `uncancelTask`; assertions `taskIsCancelled`, `actionRejected`. Names work?"

**Human:** "Yes."

```json
// Tool: advance_scenario
{ "id": "sc_001",
  "rationale": "Vocabulary confirmed: cancelTask, uncancelTask, taskIsCancelled, actionRejected.",
  "promotedBy": "agent" }
// -> { "stage": "specified" }
```

## 4. Handoff

Dispatch to TDD skill. Subagent writes domain additions, tests, and adapters.

```json
// Tool: run_tests { "domain": "task-board" } -> { "passed": 11, "failed": 0 }
// Tool: link_to_domain
{ "scenarioId": "sc_001", "domainOperation": "taskBoard.cancelTask",
  "testNames": ["cancel a task", "cancelled task cannot be moved",
    "cancelled task cannot be reassigned", "cancelling already cancelled is idempotent",
    "un-cancel restores task to todo", "cancelled task appears in cancelled count"] }
```

**Agent:** "11 tests passing (5 existing + 6 new). No regressions. All scenarios linked."

---

## Key Takeaways

1. **Greenfield skips characterization** -- Intent is known upfront.
2. **Example Mapping drives tests** -- Each rule produces examples, each example becomes a test.
3. **Questions surface edge cases** -- Un-cancel behavior clarified before implementation.
4. **Existing tests stay green** -- New operations extend without breaking.
