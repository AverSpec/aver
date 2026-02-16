# Walkthrough: New Feature with Example Mapping

A complete session trace showing Example Mapping for a new feature -- adding task cancellation to the task-board application. New features start at the "intended" stage (no observation/exploration needed) and flow through formalization and TDD.

**Scenario:** The task-board domain already has `createTask`, `deleteTask`, `moveTask`, and `assignTask`. The human wants to add task cancellation -- distinct from deletion because cancelled tasks remain visible but frozen.

---

## 1. Kickoff

```json
// Tool: get_workflow_phase → Response:
{ "phase": "kickoff",
  "reason": "No pending observations or intents. Previous items all formalized and linked." }
```

**Human:** "I want to add task cancellation to the task board. Cancelled tasks should stay visible but be frozen -- no moves or reassignments."

This is new behavior. The agent records intents, which start at "intended" and skip discovery and mapping.

## 2. Formalization: Record Intent and Run Example Mapping

### 2a. Record the intent

```json
// Tool: record_intent
{ "behavior": "Users can cancel a task, making it visible but frozen -- no moves or reassignments",
  "context": "Human requested feature addition to existing task-board domain",
  "story": "task-cancellation" }
// → { "id": "int_001", "stage": "intended" }
```

### 2b. Review existing domain

```json
// Tool: get_domain_vocabulary
{ "domain": "task-board" }
// → actions: createTask, deleteTask, moveTask, assignTask
//   queries: tasksByStatus, taskDetails
//   assertions: taskInStatus, taskAssignedTo, taskCount
```

No concept of cancellation exists. The agent also notes that `moveTask` and `assignTask` will need guard clauses.

### 2c. Example Mapping

**Story:** "Users can cancel a task, making it visible but frozen"

**Agent proposes rules:**

1. A task can be cancelled
2. A cancelled task has status "cancelled"
3. A cancelled task cannot be moved
4. A cancelled task cannot be reassigned
5. A cancelled task still appears in queries
6. Cancelling an already-cancelled task is idempotent

**Human:** "Add one more: a cancelled task can be un-cancelled, which restores it to 'todo'."

```json
// Tool: add_question
{ "itemId": "int_001",
  "text": "When un-cancelled, should the task return to its original status or always reset to 'todo'?" }
// → { "questionId": "q_001" }
```

**Human:** "Always reset to 'todo'. The original status is gone."

```json
// Tool: resolve_question
{ "itemId": "int_001", "questionId": "q_001",
  "answer": "Un-cancelling always resets to 'todo', regardless of previous status." }
```

Rule 7 added: Un-cancelling restores to "todo".

**Examples:**

| Rule | Given | When | Then |
|------|-------|------|------|
| Cancel | Task "Fix bug" in "todo" | cancelTask | Status is "cancelled" |
| Cannot move | Task cancelled | moveTask to "done" | Error: task is cancelled |
| Cannot reassign | Task cancelled | assignTask to "Bob" | Error: task is cancelled |
| Visible | Task cancelled | tasksByStatus("cancelled") | Returns the task |
| Idempotent | Task already cancelled | cancelTask again | No error, still cancelled |
| Un-cancel | Task cancelled | uncancelTask | Status is "todo" |
| Count | Task cancelled | taskCount("todo") | Does not include cancelled tasks |

```json
// Tool: add_question
{ "itemId": "int_001",
  "text": "Should taskCount include cancelled tasks, or only count them under 'cancelled'?" }
// → { "questionId": "q_002" }
```

**Human:** "Cancelled tasks only count under 'cancelled'. They leave their previous status count."

```json
// Tool: resolve_question
{ "itemId": "int_001", "questionId": "q_002",
  "answer": "Cancelled tasks only count under 'cancelled', removed from previous status." }
```

### 2d. Propose domain vocabulary

**Agent:** "I propose adding: actions `cancelTask({ title })`, `uncancelTask({ title })`; assertions `taskIsCancelled({ title })`, `actionRejected({ action, reason })`. Existing assertions like `taskInStatus` and `taskCount` handle the rest. Do these names work?"

**Human:** "Yes. I like `taskIsCancelled` as a dedicated assertion."

### 2e. Promote to formalized

```json
// Tool: promote_item
{ "id": "int_001",
  "rationale": "Example Mapping complete. 7 rules, 7 examples. Domain operations:
    cancelTask, uncancelTask, taskIsCancelled, actionRejected. All questions resolved.",
  "promotedBy": "testing" }
// → { "stage": "formalized" }
```

## 3. Implementation: TDD Inner Loop

### 3a. Add operations to the domain

```typescript
// domains/task-board.ts -- add to existing domain definition:
actions: {
  // ... existing: createTask, deleteTask, moveTask, assignTask
  cancelTask: action<{ title: string }>(),          // NEW
  uncancelTask: action<{ title: string }>(),         // NEW
},
assertions: {
  // ... existing: taskInStatus, taskAssignedTo, taskCount
  taskIsCancelled: assertion<{ title: string }>(),   // NEW
  actionRejected: assertion<{ action: string; reason: string }>(), // NEW
},
```

TypeScript immediately flags all adapter files -- missing handlers for the 4 new operations.

### 3b. Write failing tests

Each Example Mapping example becomes a test case:

```typescript
// tests/task-board.spec.ts (new tests)
test('cancel a task', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix bug' })
  await act.cancelTask({ title: 'Fix bug' })
  await assert.taskIsCancelled({ title: 'Fix bug' })
})

test('cancelled task cannot be moved', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix bug' })
  await act.cancelTask({ title: 'Fix bug' })
  await act.moveTask({ title: 'Fix bug', status: 'done' })
  await assert.actionRejected({ action: 'moveTask', reason: 'task is cancelled' })
})

test('cancelled task cannot be reassigned', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix bug' })
  await act.cancelTask({ title: 'Fix bug' })
  await act.assignTask({ title: 'Fix bug', assignee: 'Bob' })
  await assert.actionRejected({ action: 'assignTask', reason: 'task is cancelled' })
})

test('cancelled task appears in cancelled count', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix bug' })
  await act.cancelTask({ title: 'Fix bug' })
  await assert.taskCount({ status: 'cancelled', count: 1 })
  await assert.taskCount({ status: 'todo', count: 0 })
})

test('cancelling already cancelled task is idempotent', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix bug' })
  await act.cancelTask({ title: 'Fix bug' })
  await act.cancelTask({ title: 'Fix bug' })
  await assert.taskIsCancelled({ title: 'Fix bug' })
})

test('un-cancel restores task to todo', async ({ act, assert }) => {
  await act.createTask({ title: 'Fix bug' })
  await act.moveTask({ title: 'Fix bug', status: 'in-progress' })
  await act.cancelTask({ title: 'Fix bug' })
  await act.uncancelTask({ title: 'Fix bug' })
  await assert.taskInStatus({ title: 'Fix bug', status: 'todo' })
})
```

### 3c. Confirm RED

```json
// Tool: run_tests
{ "domain": "task-board" }
// → { "passed": 5, "failed": 6 }
// All 5 existing tests pass. All 6 new tests fail. RED confirmed.
```

### 3d. Implement unit adapter

The agent adds `cancelTask` and `uncancelTask` action handlers, `taskIsCancelled` and `actionRejected` assertion handlers, updates the Board model with `cancel()` and `uncancel()`, and adds guard clauses in `move()` and `assign()` that reject with "task is cancelled".

### 3e. Confirm GREEN

```json
// Tool: run_tests
{ "domain": "task-board" }
// → { "passed": 11, "failed": 0 }
```

```json
// Tool: get_run_diff
// → { "newlyPassing": ["cancel a task [unit]", "cancelled task cannot be moved [unit]",
//      "cancelled task cannot be reassigned [unit]", "cancelled task appears... [unit]",
//      "cancelling already cancelled... [unit]", "un-cancel restores... [unit]"],
//    "newlyFailing": [], "stillFailing": [] }
```

### 3f. Link workspace items

```json
// Tool: link_to_domain
{ "itemId": "int_001", "domainOperation": "taskBoard.cancelTask",
  "testNames": ["cancel a task", "cancelled task cannot be moved",
    "cancelled task cannot be reassigned", "cancelled task appears in cancelled count",
    "cancelling already cancelled task is idempotent", "un-cancel restores task to todo"] }
```

## 4. Verification

```json
// Tool: run_tests → { "passed": 11, "failed": 0 }
// Tool: get_run_diff → { "newlyFailing": [], "stillFailing": [] }
```

**Agent:** "Verification complete. 11 tests passing (5 existing + 6 new). No regressions. All formalized items linked.

Coverage: task-lifecycle (5 tests), task-cancellation (6 tests). No open questions."

**Human:** "Looks good."

```json
// Tool: export_workspace → Portable summary for PR description
```

---

## Key Takeaways

1. **Intents skip discovery and mapping** -- New features start at "intended" and go straight to Example Mapping. No observation or exploration phase needed.
2. **Example Mapping drives test design** -- Each rule produced examples, each example became a test. The business-to-domain mapping happened before any code was written.
3. **Questions surface edge cases** -- Un-cancel behavior and count semantics were clarified during Example Mapping, preventing ambiguity in implementation.
4. **Existing tests stay green** -- The 5 original tests continued to pass. New operations extended the domain without breaking existing behavior.
5. **TypeScript enforces completeness** -- Adding operations to the domain flagged every adapter needing updates. No handler could be forgotten.
