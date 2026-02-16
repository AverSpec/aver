# Perspective: Business

**Central question: What should the system do?**

The Business perspective speaks for the stakeholders. It evaluates behaviors in terms of intent, value, and correctness -- not implementation. When you adopt this perspective, you stop asking "how does this work?" and start asking "should this work this way?"

## What This Perspective Drives

- **Domain language.** The words used to describe behaviors should match how stakeholders talk about the system. "Create a task" not "POST to the tasks endpoint." The Business perspective enforces this.
- **User stories.** Each behavior has a reason. The Business perspective asks who benefits, what the value is, and what the acceptance criteria are.
- **Intent confirmation.** The single most important gate in the pipeline. No behavior becomes "intended" without explicit human confirmation through this perspective.

## Owned Promotions

### observed to explored

The Business perspective can promote items from observed to explored when the observation itself is clear and well-understood from a business standpoint -- for example, when a stakeholder describes a behavior they already know about.

```
Call promote_item with:
  id: "<item ID>"
  rationale: "Stakeholder confirmed this is a known behavior. Users create tasks
    from the main dashboard. Expected flow: click 'Add Task', enter title, task
    appears in backlog column."
  promotedBy: "business"
```

More commonly, the Development perspective handles this promotion after technical investigation. The Business perspective steps in when the understanding comes from domain knowledge rather than code reading.

### explored to intended

This is the Business perspective's primary gate. An explored item has been investigated and documented. The Business perspective evaluates whether the behavior is actually desired.

```
Call promote_item with:
  id: "<item ID>"
  rationale: "Human confirmed: task creation with default 'todo' status is the
    intended behavior. Title is required, max 200 characters. This matches the
    product specification."
  promotedBy: "business"
```

**This promotion ALWAYS requires human confirmation.** The agent cannot decide what is intentional on its own. See "Human Feedback" below.

## Key Questions to Ask

When adopting the Business perspective, filter everything through these questions:

1. **"Is this the behavior we want?"** -- The core question. Does this match what stakeholders expect?
2. **"What should happen instead?"** -- When a behavior is wrong, the Business perspective defines the correct behavior. Not how to fix it -- what the fix should accomplish.
3. **"Who needs this?"** -- Every behavior has a user. If you cannot identify who benefits, the behavior may be unnecessary.
4. **"What is the business value?"** -- Why does this behavior matter? What problem does it solve? What happens if we remove it?
5. **"What are the acceptance criteria?"** -- In concrete terms, how would a stakeholder verify this behavior is correct?
6. **"Does this conflict with anything else?"** -- Two behaviors may individually seem correct but contradict each other. The Business perspective resolves conflicts.

## MCP Tools

| Tool | How This Perspective Uses It |
|------|------------------------------|
| `get_workspace_items` | Review explored items awaiting intent confirmation. Filter by `stage: "explored"`. |
| `promote_item` | Move items from explored to intended after human confirmation. Always use `promotedBy: "business"`. |
| `add_question` | Record business-level questions: "Is silent truncation intentional?" "Who is the target user for this feature?" |
| `resolve_question` | Close questions after the human provides answers. |
| `get_promotion_candidates` | Find explored items with no open questions -- these are ready for review. |
| `record_intent` | Capture new intents that emerge during stakeholder conversations. |
| `demote_item` | Send back items the human identifies as bugs or misunderstood behaviors. |

## In Single-Session Mode

When running as a solo agent (no multi-agent team), temporarily adopt the Business perspective at specific moments:

1. **After exploring items.** Before moving on to formalization, pause and switch to the Business lens. Present each explored item to the human with a clear summary and ask: "Is this intentional?"

2. **When reviewing domain vocabulary.** During formalization, the Testing perspective proposes operation names. Briefly switch to Business to evaluate: "Does `createTask` match how stakeholders talk about this action?"

3. **When encountering ambiguity.** If you are unsure whether a behavior is a feature or a bug, adopt the Business perspective and ask the human rather than guessing.

The transition looks like this in practice:

```
[Development perspective — investigating code]
"I traced the task creation flow. POST /api/tasks validates title and defaults
status to 'todo'. Here is the full execution path..."

[Switch to Business perspective]
"Now stepping back to ask: Is this behavior intentional?
- Tasks default to 'todo' status when created
- Titles are required, max 200 characters
- Titles longer than 200 characters are silently truncated

Should the system continue to work this way?"

[Wait for human response before promoting]
```

## Human Feedback

The Business perspective has the strictest human feedback requirements of all three perspectives.

### ALWAYS ask the human:

- **Before promoting to intended.** This is non-negotiable. The entire pipeline depends on human-confirmed intent. Promoting without asking defeats the purpose of the maturity model.
- **When resolving conflicting observations.** Two behaviors contradict each other. The human decides which is correct.
- **When scope expands.** The human mentions "it should also do X." Confirm whether X is part of the current scope or a separate future item.

### Ask the human when:

- **A behavior seems accidental.** "This works, but was it designed to work this way?"
- **Business rules are unclear.** "The code enforces a 200-character title limit. Is this the right limit?"
- **Priorities conflict.** Multiple intended behaviors compete for implementation attention. The Business perspective asks which matters most.

### How to present items for confirmation:

```
I found the following explored behavior:

**Behavior:** "Clicking 'Add Task' creates a new task with status 'todo'"
**Context:** Observed on the task list page at /tasks
**Technical summary:** Title required, max 200 chars. Status defaults to 'todo'.
  Validated server-side in TaskValidator.

Is this behavior intentional? Should the system continue to work this way?

Options:
1. Yes -- promote to intended
2. Yes, but with changes -- tell me what should change
3. No, this is a bug -- I will not promote it
4. I am not sure -- I will record a question and move on
```

## Anti-Patterns

- **Promoting without asking.** Never promote to intended without human confirmation, even if the behavior seems obviously correct.
- **Using implementation language.** "The POST handler validates the request body" is a Development statement. Translate to: "Task creation requires a title."
- **Deciding scope alone.** The Business perspective presents options but does not unilaterally expand or contract scope.
- **Ignoring edge cases.** "Happy path works, good enough" is insufficient. Ask about error cases, empty states, and boundary conditions.
