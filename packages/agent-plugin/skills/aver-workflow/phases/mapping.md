# Phase: Mapping

Explored items exist in the workspace with investigation rationale. Your job is to review each one through the Business lens and confirm whether the behavior is intentional. Items confirmed as intentional get promoted to "intended."

## Active Perspective

**Business** is the primary perspective. You are deciding: Is this behavior something we want the system to do? Not how it works (that was discovery), but whether it should work this way.

## What to Do

### 1. Review Explored Items

```
Call get_workspace_items with stage: "explored"
```

For each explored item, read the behavior description and the promotion rationale from the discovery phase. The rationale contains the technical evidence -- your job now is to evaluate the intent.

### 2. Present Items to the Human for Confirmation

This is the most important human feedback point in the entire pipeline. **You MUST NOT promote items to "intended" without human confirmation.**

Present each item clearly:

```
I found the following explored behavior:

**Behavior:** "Clicking 'Add Task' creates a new task with status 'todo'"
**Context:** Observed on the task list page at /tasks
**Technical detail:** POST /api/tasks -> TaskController.create() -> TaskService.create()
  validates title (required, max 200 chars) and status (must be 'todo').
  Seam: TaskService injectable via constructor.

Is this behavior intentional? Should the system continue to work this way?
```

Wait for the human to respond before promoting. Possible outcomes:

- **"Yes, that's correct"** -- Promote to intended.
- **"Yes, but with changes"** -- Record a new intent with the corrected behavior. Demote the explored item or leave it.
- **"No, that's a bug"** -- Do not promote. Add a question noting it is a bug, or remove the item.
- **"I'm not sure"** -- Add a question and move to the next item.

### 3. Resolve Open Questions

The discovery phase may have left open questions that require human input. Present these alongside the item review:

```
This item has an open question from the development phase:
"Does TaskService silently truncating long titles -- is this intended?"

Can you clarify?
```

Use `resolve_question` once the human answers.

### 4. Promote to Intended

When the human confirms a behavior is intentional:

```
Call promote_item with:
  id: "<the item's ID>"
  rationale: "Human confirmed: task creation with 'todo' default status is the intended
    behavior. Title validation (required, max 200 chars) is correct."
  promotedBy: "business"
```

The `promotedBy` field should be `"business"` to indicate this was a business decision, not a technical one.

### 5. Group Items into Stories

As you confirm items, look for natural groupings. Items that relate to the same feature or workflow should share a `story` label. You cannot set `story` through `promote_item`, but you can note groupings for the formalization phase.

Example groupings:
- Story: `"task-creation"` -- creating tasks, validation rules, default values
- Story: `"task-lifecycle"` -- status transitions, completion, archival
- Story: `"task-assignment"` -- assigning users, unassignment, team visibility

### 6. Handle Edge Cases

**Conflicting observations.** Two explored items may describe contradictory behaviors. Present both to the human and ask which is correct. Demote the incorrect one.

**Scope creep.** The human may say "yes, and it should also do X." Record X as a new intent, but do not expand the scope of the current item. Keep items focused on single behaviors.

**Accidental behavior.** If the human says a behavior is accidental (works but should not), do not promote it. Either demote it to observed with a note, or leave it explored with a question about whether to fix it.

## MCP Tools for This Phase

| Tool | When to Use |
|------|------------|
| `get_workspace_items` | List explored items for review. |
| `get_promotion_candidates` | Find items with no open questions ready for promotion. |
| `promote_item` | Move confirmed items from explored to intended. |
| `add_question` | Record uncertainty -- "Is this behavior intentional?" |
| `resolve_question` | Record the human's answer to an open question. |
| `demote_item` | Send back items that are bugs or misunderstood behaviors. |
| `record_intent` | Capture new intents the human mentions during review. |

## CLI Alternative

```bash
aver workspace items --stage explored
aver workspace promote <id> --rationale "Human confirmed intended" --by business
aver workspace question <id> "Is silent title truncation intentional?"
aver workspace demote <id> --to observed --rationale "Human identified as a bug"
```

## Human Feedback Triggers

Human involvement is **REQUIRED** for every item in this phase. Never promote to intended without explicit confirmation. Specific prompts:

1. **For each explored item** -- "Is this behavior intentional? Should the system continue to work this way?"
2. **For open questions** -- Present the question and wait for an answer.
3. **For conflicts** -- "These two behaviors contradict each other. Which is correct?"
4. **For scope** -- "You mentioned the system should also do X. Should I record that as a separate intent?"

## Exit Criteria

Move to the formalization phase when:

- [ ] All explored items have been reviewed with the human
- [ ] Confirmed items are promoted to "intended" with `promotedBy: "business"`
- [ ] Open questions from discovery are resolved
- [ ] Conflicting or accidental behaviors are demoted or annotated
- [ ] New intents mentioned by the human are recorded

## What Happens Next

The **formalization** phase activates when intended items exist. The Testing perspective takes over to run Example Mapping -- generating concrete rules, examples, and test scenarios for each intended behavior.

Call `get_workflow_phase` to confirm the transition.
