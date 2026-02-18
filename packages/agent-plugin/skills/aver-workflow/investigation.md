# Investigation (Legacy Characterization)

Autonomous agent investigation of existing systems to characterize behavior. This is the legacy entry path for advancing scenarios from `captured` to `characterized`.

## When to Use

An existing system has behavior that is unknown, undocumented, or untested. The agent needs to build understanding before the human can confirm intent. This path is skipped for greenfield scenarios where intent is already known.

## Agent Investigates Autonomously

The agent traces code paths, finds seams, and captures evidence without blocking on human input. The human course-corrects at checkpoints, not during investigation.

Investigation activities:
1. Trace the code path from entry point (route, event listener, UI component) to effect (database write, API response, DOM update)
2. Identify seams where tests can attach
3. Note constraints that shape the behavior (schemas, validation, config)
4. Capture current behavior with approval tests as evidence
5. Record findings as scenario context

## Seam Types

A seam (per Feathers) is where you can observe or intercept behavior without modifying source.

| Seam Type | What to Look For | Test Attachment |
|-----------|------------------|-----------------|
| Function boundary | Exported function with clear inputs/outputs | Call directly with controlled inputs |
| Constructor injection | Dependencies passed in, not hard-coded | Substitute with test doubles |
| Config point | Behavior controlled by env/config | Override config in test setup |
| Middleware/hooks | Interception points in a pipeline | Insert test middleware |
| API boundary | HTTP endpoints with request/response contracts | Call endpoint, assert response |
| Rendering output | UI components producing deterministic HTML/pixels | Screenshot comparison |

**How to find seams:**
1. Start from the observed behavior. Trace from entry point to effect.
2. At each function boundary, ask: "Can I call this in isolation with controlled inputs?"
3. Mark boundaries where the answer is yes.
4. If no clean seams exist, look one level out -- can you intercept at the caller?

## Characterize with Approval Tests

Approval tests capture what the system actually does, not what it should do. They are evidence, not specification.

**Structural approvals** -- for data outputs (API responses, computed values):
Use `approve(value)` from `@aver/approvals`. First run captures the baseline. Subsequent runs compare against it.

**Visual approvals** -- for rendered UI:
Use `approve.visual('name')`. Requires a `screenshotter` extension from the protocol (Playwright adapters provide this).

**Choosing between them:**

| Use structural when | Use visual when |
|---------------------|-----------------|
| Output is data (JSON, text) | Output is rendered UI |
| You care about field values | You care about layout/styling |
| No browser involved | Playwright adapter available |

Approval baselines are evidence for the mapping session. They show the human exactly what the system does today.

## Checkpoint Model

The agent posts findings as scenario context. Checkpoints are non-blocking -- the agent continues investigating independent scenarios while waiting for human response.

**Post findings:**
Update the scenario with investigation evidence (code paths traced, seams found, approval baselines created).

**Ask targeted questions:**
```
Call add_question with:
  scenarioId: "<scenario ID>"
  text: "TaskService silently truncates titles over 200 chars. Is this intended, or a bug?"
```

**Continue on independent work:**
Don't block. Move to the next `captured` scenario and investigate it. Return when the human responds.

**Course-correct:**
If the human says the behavior is a bug (not intended), regress the scenario or record a new one for the correct behavior.

## Output

A `characterized` scenario has:
- Execution path documented (entry point through to effect)
- Seams identified with test attachment strategy
- Constraints noted (schemas, validation, config)
- Approval baselines captured as evidence
- Questions posted for anything requiring human judgment

## Advancement to `characterized`

```
Call advance_scenario with:
  id: "<scenario ID>"
  rationale: "Investigation complete.
    Code path: POST /api/tasks -> TaskController.create() -> TaskService.create() -> DB insert.
    Seams: TaskService constructor (injectable deps), /api/tasks endpoint (HTTP boundary).
    Constraints: title required, max 200 chars, status enum.
    Evidence: structural approval baseline for API response captured.
    Questions: 1 posted (title truncation behavior)."
  promotedBy: "agent"
```

## How This Feeds Scenario Mapping

Characterized scenarios carry evidence into the mapping session:
- Approval baselines show the human what the system actually does
- Seam analysis tells the agent where tests will attach
- Constraints become candidate rules during Example Mapping
- Open questions become the starting agenda for the mapping conversation

The mapping session (see `scenario-mapping.md`) uses this evidence to extract rules, examples, and domain vocabulary.

## Graduating Approval Tests

Approval tests are a starting point, not a destination. As scenarios advance through mapping and specification, replace approval tests with named domain assertions:

- Approval tests lock down the entire output (brittle, but comprehensive)
- Named assertions check specific properties (resilient, but targeted)
- Graduate incrementally -- keep approvals running alongside named assertions until coverage is confirmed

## Anti-Patterns

- **Approving baselines without reviewing.** First run captures whatever the system does. Inspect before accepting.
- **Modifying code before capturing.** Capture current behavior first. Changes come after the safety net exists.
- **Blocking on human response.** Post the question and move to independent work. Come back later.
- **Testing through only one seam.** Legacy systems often have inconsistencies between API, UI, and internal logic. Capture at multiple seams.
- **Skipping seam analysis.** Without seams, tests require the full system running. Find the narrowest seam that exercises the behavior.
