# Phase: Discovery

Observations exist in the workspace. Your job is to investigate each one -- read code, trace paths, find seams -- and promote items from "observed" to "explored" with solid context and rationale.

## Active Perspective

**Development** is the primary perspective. You are reading code, understanding architecture, and building a technical picture of how the observed behaviors actually work.

## What to Do

### 1. Get Your Bearings

Start each discovery session by understanding what needs attention:

```
Call get_workspace_items with stage: "observed"
```

This gives you the list of raw observations. Work through them one at a time, starting with the simplest.

### 2. Investigate Each Observation

For each observed item, your goal is to answer: **How does this behavior actually work?**

Investigation techniques:

- **Trace the code path.** Find the entry point (route handler, event listener, UI component) and follow execution through to the effect (database write, DOM update, API response).
- **Identify seams.** A seam is a place where you could intercept or substitute behavior -- a function boundary, an interface, a configuration point. These become adapter attachment points later.
- **Note constraints.** What limits or shapes this behavior? Database schemas, validation rules, external service contracts, environment variables.
- **Record what you learn.** Use `add_question` for things you cannot determine from code alone. Use `record_observation` for new behaviors you discover while investigating.

### 3. Ask Questions

When investigation reveals ambiguity, use `add_question` to attach a question to the item:

```
Call add_question with:
  itemId: "<the item's ID>"
  text: "Does this validation happen client-side, server-side, or both?"
```

Questions that require human input will be addressed during the mapping phase. Questions you can answer through code investigation should be resolved immediately:

```
Call resolve_question with:
  itemId: "<the item's ID>"
  questionId: "<the question's ID>"
  answer: "Server-side only -- validated in TaskValidator.validate() at src/validators/task.ts:23"
```

### 4. Promote to Explored

When you understand how a behavior works, promote it. The `rationale` is the key output -- it captures your understanding:

```
Call promote_item with:
  id: "<the item's ID>"
  rationale: "Task creation flows through POST /api/tasks -> TaskController.create() ->
    TaskService.create() -> database insert. Validation in TaskValidator checks title
    (required, max 200 chars) and status (must be 'todo'|'in-progress'|'done').
    Seam: TaskService is injected via constructor, can be stubbed for unit testing."
  promotedBy: "development"
```

A good rationale includes:
- The execution path (entry point through to effect)
- Key files and line numbers
- Seams where testing can attach
- Constraints that shape the behavior
- Any surprises or edge cases found

A bad rationale is vague: "Looked at the code, seems to work." This provides no value to the next phase.

### 5. Record New Observations

Investigation frequently reveals behaviors you did not initially observe. Record them:

```
Call record_observation with:
  behavior: "TaskService.create() silently truncates titles longer than 200 characters
    instead of returning a validation error"
  context: "Found in src/services/task.ts:45 during investigation of task creation"
```

This keeps the pipeline fed with new material.

## MCP Tools for This Phase

| Tool | When to Use |
|------|------------|
| `get_workspace_items` | List observed items that need investigation. |
| `add_question` | Record something you cannot determine from code alone. |
| `resolve_question` | Answer a question you resolved through investigation. |
| `promote_item` | Move an item from observed to explored (with detailed rationale). |
| `record_observation` | Record new behaviors discovered during investigation. |
| `get_promotion_candidates` | Find items with no open questions ready for promotion. |

## CLI Alternative

```bash
aver workspace items --stage observed
aver workspace question <id> "Does validation happen client or server side?"
aver workspace promote <id> --rationale "Code path traced through..." --by development
```

## Human Feedback Triggers

Ask the human when:

1. **Code is unclear** -- "I found a complex conditional in TaskService.create() at line 45. Can you explain the business rule behind it?"
2. **Behavior seems unintentional** -- "TaskService silently truncates long titles. Is this intended, or a bug?" (Do not promote to explored if it might be a bug -- ask first.)
3. **Architecture questions** -- "Are TaskService and NotificationService supposed to be coupled, or is this an accidental dependency?"

## Exit Criteria

Move to the mapping phase when:

- [ ] All observed items have been investigated
- [ ] Investigated items are promoted to "explored" with detailed rationale
- [ ] Each promoted item's rationale includes: execution path, key files, seams, constraints
- [ ] New observations discovered during investigation are recorded
- [ ] Questions that require code investigation are resolved
- [ ] Questions that require human input are recorded (they will be addressed in mapping)

## What Happens Next

The **mapping** phase activates when explored items exist. The Business perspective takes over to confirm whether each explored behavior is intentional. Your investigation rationale is the evidence they will use to decide.

Call `get_workflow_phase` to confirm the transition.
