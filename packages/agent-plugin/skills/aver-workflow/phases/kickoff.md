# Phase: Kickoff

Starting a new workflow session. The workspace is empty or nearly empty. Your job is to understand the target system and begin recording raw material for the pipeline.

## Active Perspectives

All three perspectives participate lightly during kickoff:

- **Business** -- What system are we targeting? What matters most?
- **Development** -- Is this a legacy system to characterize, or new behavior to build?
- **Testing** -- What kind of verification will be needed? (Structural, visual, both?)

## What to Do

### 1. Ask the Human About the Target System

Before recording anything, you need context. Ask:

- **What system or feature are we working on?** Get a name, a URL, a file path -- something concrete.
- **Legacy or new?** This determines which workflow pattern to follow:
  - **Legacy characterization**: The system exists. You will observe current behaviors, confirm which are intentional, and formalize tests around them. Start with `record_observation`.
  - **New development**: The behavior does not exist yet. You will capture intent first, then build. Start with `record_intent`.
- **What is the scope?** A single feature? A whole module? An API endpoint? Narrow is better for a first pass.

### 2. Record Initial Observations or Intents

Once you know the target, begin recording. Aim for at least 3 items before moving on.

**For legacy characterization:**

```
Use record_observation for each behavior you notice.

Good observations:
- "Clicking 'Add Task' creates a new task with status 'todo'"
- "Tasks with no assignee show 'Unassigned' in the list view"
- "The /api/tasks endpoint returns 404 when no tasks exist"

Bad observations (too vague):
- "The task system works"
- "Users can do things with tasks"
```

**For new development:**

```
Use record_intent for each desired behavior.

Good intents:
- "Users can drag tasks between columns to change status"
- "Completing all subtasks automatically completes the parent task"
- "The API returns 400 with validation errors when required fields are missing"

Bad intents (implementation details, not behavior):
- "Add a Redux store for tasks"
- "Create a POST endpoint at /api/tasks"
```

### 3. Add Context to Every Item

Always include the `context` parameter. Context helps future phases understand where and how this behavior was observed or imagined.

Good context examples:
- `"Observed on the task list page at /tasks"`
- `"Behavior requested in PRD section 3.2"`
- `"Discovered while reading TaskService.create() in src/services/task.ts"`

### 4. Group Related Items with Stories

If you can already see clusters of related behavior, use the `story` parameter on `record_intent` to group them. Story names are short labels like `"task-creation"` or `"status-transitions"`.

Do not force grouping. It is fine to leave story empty during kickoff and assign stories later during mapping.

## MCP Tools for This Phase

| Tool | When to Use |
|------|------------|
| `get_workflow_phase` | First call of every session. Confirms you are in kickoff. |
| `record_observation` | Legacy characterization: record each behavior you notice. |
| `record_intent` | New development: record each desired behavior. |
| `get_workspace_summary` | Check your progress (how many items recorded). |

## CLI Alternative

```bash
aver workspace observe "Clicking Add Task creates a new task"
aver workspace intend "Users can drag tasks between columns"
aver workspace summary
```

## Human Feedback Triggers

You MUST ask the human:

1. **What system to target** -- Never assume. Even if the codebase has one obvious app, confirm.
2. **Legacy or new** -- This changes the entire workflow. Ask explicitly.
3. **Scope boundaries** -- "Should I focus just on task creation, or the whole task lifecycle?"

## Exit Criteria

Move to the next phase when ALL of these are true:

- [ ] At least 3 observations or intents have been recorded
- [ ] Each item has a meaningful `behavior` description (specific, not vague)
- [ ] Each item has `context` (where it was observed or why it is desired)
- [ ] You know whether this is legacy characterization or new development

## What Happens Next

- If you recorded **observations** (legacy), the next phase is **discovery** -- you will explore the system to understand each observation in depth.
- If you recorded **intents** (new development), the next phase is **formalization** -- you will run Example Mapping to generate concrete test scenarios. (Intents start at the "intended" stage, so they skip discovery and mapping.)

Call `get_workflow_phase` to confirm which phase the system detects based on your recorded items.
