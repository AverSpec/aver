# Perspective: Development

**Central question: How does the system work?**

The Development perspective reads code, traces execution paths, identifies seams, and builds a technical understanding of how observed behaviors actually function. When you adopt this perspective, you stop evaluating intent and focus on mechanics -- what the code does, where the boundaries are, and what constraints exist.

## What This Perspective Drives

- **Code exploration.** Reading source files, following imports, tracing request handling from entry point to side effect. The Development perspective maps the territory.
- **Seam identification.** A seam is a place where you can intercept or substitute behavior -- a function boundary, an injected dependency, a configuration point. Seams become adapter attachment points in Aver.
- **Architecture understanding.** How are components organized? What are the layers? Where are the dependencies? This context shapes how tests get structured.
- **Constraint discovery.** Database schemas, validation rules, external service contracts, environment variables, rate limits. Constraints define the boundaries of what the system can and cannot do.

## Owned Promotions

### observed to explored

This is the Development perspective's primary contribution. An observed behavior is a raw fact -- "clicking X does Y." The Development perspective investigates the code to understand the mechanism and promotes with a detailed rationale.

```
Call promote_item with:
  id: "<item ID>"
  rationale: "Task creation flows through POST /api/tasks -> TaskController.create()
    -> TaskService.create() -> database insert. Validation in TaskValidator checks
    title (required, max 200 chars) and status (must be 'todo'|'in-progress'|'done').
    Seam: TaskService is injected via constructor, can be stubbed for unit testing.
    Key files: src/controllers/task.ts:12, src/services/task.ts:34,
    src/validators/task.ts:8"
  promotedBy: "development"
```

A good rationale from the Development perspective includes:
- The full execution path (entry point through to effect)
- Key file paths and line numbers
- Seams where testing can attach
- Constraints that shape the behavior
- Anything surprising or non-obvious

A bad rationale is vague: "Looked at the code, seems standard." This provides no value to subsequent phases.

## Key Questions to Ask

When adopting the Development perspective, filter everything through these questions:

1. **"Where is this implemented?"** -- Find the entry point. For an API: which route handler? For a UI: which component? For a background job: which scheduler?
2. **"What are the seams?"** -- Where can you intercept behavior without modifying the source? Constructor injection, middleware, event listeners, configuration files.
3. **"What are the constraints?"** -- What limits exist? Validation rules, schema restrictions, rate limits, timeouts, external service contracts.
4. **"What would break if we changed this?"** -- Trace the dependencies outward. What calls this code? What does this code call? Where are the coupling points?
5. **"What is the data flow?"** -- How does data enter, transform, and persist? What shape is it at each stage?
6. **"Are there side effects?"** -- Does this code send emails, write logs, publish events, update caches? Side effects matter for testing strategy.

## MCP Tools

| Tool | How This Perspective Uses It |
|------|------------------------------|
| `get_workspace_items` | List observed items that need investigation. Filter by `stage: "observed"`. |
| `record_observation` | Record new behaviors discovered during code investigation. |
| `add_question` | Record technical questions that need human input: "Is this coupling intentional?" |
| `promote_item` | Move items from observed to explored with detailed technical rationale. Always use `promotedBy: "development"`. |
| `get_project_context` | Discover Aver file structure -- domain files, adapter files, test files, naming conventions. Essential for knowing where things live. |
| `resolve_question` | Close questions you can answer through code investigation. |
| `get_promotion_candidates` | Find observed items with no open questions -- these are ready for investigation. |

## In Single-Session Mode

When running as a solo agent, the Development perspective is active during the discovery phase and parts of the implementation phase:

1. **During discovery.** This is the primary perspective. Read code, trace paths, build understanding. For each observed item, investigate until you can write a detailed promotion rationale.

2. **During implementation.** The Development perspective writes adapter handlers. When the Testing perspective defines a domain operation, switch to Development to figure out how to implement the handler for each protocol:
   - **Unit adapter:** What in-memory data structure represents the state? How do you manipulate it directly?
   - **HTTP adapter:** What endpoint and HTTP method? What request/response shapes?
   - **Playwright adapter:** What UI elements? What selectors? What wait conditions?

3. **When investigating failures.** Test failures often require Development perspective to diagnose. Read the trace, find the handler, understand why it failed.

The transition looks like this in practice:

```
[Development perspective — investigating an observation]
"I am tracing the task deletion flow. The entry point is DELETE /api/tasks/:title
at src/routes/tasks.ts:45. It calls TaskService.delete() which:
1. Looks up the task by title (throws 404 if not found)
2. Removes the task from the database
3. Publishes a 'task.deleted' event

Seams: TaskService injectable, event publisher injectable.
Constraint: Only the task creator can delete (checked in middleware at line 38).

Promoting to explored with this rationale."

[Later, switch to Business perspective to confirm intent]
```

## Investigation Techniques

### Trace the code path

Start from the entry point and follow execution linearly. Record each hop with file and line number:

```
Entry: DELETE /api/tasks/:title
  -> src/routes/tasks.ts:45 (route handler)
  -> src/middleware/auth.ts:12 (authorization check)
  -> src/services/task.ts:89 (service method)
  -> src/repositories/task.ts:23 (database delete)
```

### Identify seams

Look for: constructor injection, interface boundaries, configuration points, middleware/hooks, and event systems. Each seam is a potential adapter attachment point.

### Map side effects

Side effects determine adapter setup/teardown needs: database writes need schema setup, external API calls need mocks, event publishing needs subscriber setup, file system writes need temp directories.

## Human Feedback

The Development perspective has moderate human feedback requirements.

### Ask the human when:

- **Architecture is unfamiliar.** "This codebase uses a CQRS pattern I have not seen before. Can you explain the command/query separation?"
- **Code intent is unclear.** "There is a commented-out validation check at line 45. Was this disabled intentionally, or is it a leftover from debugging?"
- **Dependencies are surprising.** "TaskService depends on NotificationService. Is this coupling intentional, or should these be separate concerns?"
- **Configuration is environment-specific.** "This behavior changes based on `FEATURE_FLAG_X`. Which setting should tests use?"

### Do NOT ask the human:

- About standard patterns you can understand from the code
- About implementation details you can trace yourself
- About "is this good code?" -- the Development perspective documents what exists, not whether it is well-written

## Anti-Patterns

- **Evaluating intent.** "This behavior seems wrong" is a Business judgment. The Development perspective documents what the code does, then hands off to Business.
- **Skipping the rationale.** Promoting with "code looks fine" wastes the investigation. Write the path, the seams, the constraints.
- **Ignoring new observations.** If you discover unexpected behaviors during investigation, record them with `record_observation`. Do not silently skip them.
- **Premature implementation.** The Development perspective during discovery only investigates -- it does not write new code until the implementation phase.
- **Guessing at configuration.** If a behavior depends on environment variables or feature flags, ask rather than assuming the default.
