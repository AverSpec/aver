# Phase: Formalization

Intended items exist in the workspace -- behaviors confirmed as desired by the business. Your job is to run Example Mapping on each one, generating concrete rules, examples, and questions that will drive test creation.

## Active Perspective

**Testing** is the primary perspective. You are thinking about verification: What are the rules? What are the concrete examples? What edge cases exist? What questions remain?

## What to Do

### 1. Review Intended Items

```
Call get_workspace_items with stage: "intended"
```

Work through intended items one at a time. Each becomes an Example Mapping session.

### 2. Run Example Mapping

Example Mapping is a structured technique for decomposing a story into testable pieces. For each intended item:

**Step 1: State the story.**
The behavior description from the intended item IS the story. Write it as a single sentence.

```
Story: "Users can create tasks with a title and default 'todo' status"
```

**Step 2: Extract rules.**
Rules are the business rules that govern the story. Each rule is a single constraint or invariant.

```
Rules:
- Title is required
- Title maximum length is 200 characters
- Default status is 'todo'
- Status must be one of: 'todo', 'in-progress', 'done'
```

**Step 3: Generate examples for each rule.**
Each rule gets one or more concrete examples. An example has a given condition, an action, and an expected outcome.

```
Rule: "Title is required"
  Example 1: Given no title → create task → returns validation error "title is required"
  Example 2: Given empty string title → create task → returns validation error "title is required"

Rule: "Title maximum length is 200 characters"
  Example 1: Given title of 200 characters → create task → succeeds
  Example 2: Given title of 201 characters → create task → returns validation error
```

**Step 4: Capture questions.**
Any ambiguity discovered during example generation becomes a question. Do not guess -- record it.

```
Question: "Should whitespace-only titles be treated as empty?"
Question: "What happens if status is omitted vs explicitly set to null?"
```

### 3. Record Examples on the Item

Currently, examples and rules are tracked in your session context. When you promote the item to formalized, include the Example Mapping results in the rationale.

For questions that arise during Example Mapping, use `add_question` on the item. Resolve them with the human before promoting.

### 4. Map Examples to Domain Operations

Before promoting, think about which Aver domain operations each example maps to. This is where you start bridging from business language to domain vocabulary.

```
Example: "Given no title → create task → returns validation error"
  → Action: taskBoard.createTask({ title: '' })
  → Assertion: taskBoard.hasValidationError('title is required')

Example: "Given title of 200 chars → create task → succeeds"
  → Action: taskBoard.createTask({ title: 'A'.repeat(200) })
  → Query: taskBoard.getTaskCount()
  → Assertion: taskBoard.taskExists(...)
```

Do NOT write actual code yet. Just identify the operation names and their rough shape. These names become the domain vocabulary in the implementation phase.

### 5. Get Human Confirmation on Operation Names

Present your proposed domain vocabulary to the human:

```
For the "task creation" story, I propose these domain operations:

Actions:
- createTask(input) -- creates a new task
- deleteTask(id) -- removes a task

Queries:
- getTaskCount() -- number of tasks
- getTask(id) -- single task details

Assertions:
- taskExists(id) -- task is in the system
- hasValidationError(field, message) -- validation failed with specific error

Do these names make sense for your domain language?
```

Names should use business language, not implementation details. "createTask" not "postToTasksEndpoint". "hasValidationError" not "responseStatusIs400".

### 6. Promote to Formalized

When Example Mapping is complete and the human approves the operation names:

```
Call promote_item with:
  id: "<the item's ID>"
  rationale: "Example Mapping complete. Rules: [title required, title max 200, default
    status 'todo', valid statuses]. 6 examples generated covering happy path and
    validation errors. Domain operations: createTask, getTaskCount, taskExists,
    hasValidationError."
  promotedBy: "testing"
```

### 7. Link Domain Operations (Preview)

If you are confident about the domain operation names, you can start linking:

```
Call link_to_domain with:
  itemId: "<the item's ID>"
  domainOperation: "taskBoard.createTask"
```

This is optional during formalization. The implementation phase will finalize all links.

## MCP Tools for This Phase

| Tool | When to Use |
|------|------------|
| `get_workspace_items` | List intended items for Example Mapping. |
| `add_question` | Record questions discovered during Example Mapping. |
| `resolve_question` | Resolve questions with human answers. |
| `promote_item` | Move items from intended to formalized (with full Example Mapping rationale). |
| `link_to_domain` | Preview-link items to domain operations (optional). |
| `get_promotion_candidates` | Find items with no open questions ready for promotion. |

## CLI Alternative

```bash
aver workspace items --stage intended
aver workspace promote <id> --rationale "Example Mapping complete..." --by testing
aver workspace link <id> --domain-operation "taskBoard.createTask"
```

## Human Feedback Triggers

1. **Domain operation naming** -- "I propose calling this action `createTask`. Does that match how you talk about this behavior?" REQUIRED before promoting.
2. **Ambiguous rules** -- "Should whitespace-only titles be treated as empty? This affects the validation examples."
3. **Missing examples** -- "I have examples for happy path and validation errors. Are there other edge cases I should consider?"
4. **Scope of operations** -- "Should `createTask` handle both simple creation and creation with assignments, or should those be separate operations?"

## Exit Criteria

Move to the implementation phase when:

- [ ] All intended items have been through Example Mapping
- [ ] Each formalized item has rules and concrete examples in its rationale
- [ ] Domain operation names are proposed and confirmed by the human
- [ ] Questions discovered during Example Mapping are resolved
- [ ] Items are promoted to "formalized" with complete rationale

## What Happens Next

The **implementation** phase activates when formalized items exist. Development and Testing perspectives collaborate to write actual domain definitions, failing tests, and adapter implementations -- the TDD inner loop.

Call `get_workflow_phase` to confirm the transition.
