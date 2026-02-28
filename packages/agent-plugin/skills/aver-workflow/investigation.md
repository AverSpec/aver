# Investigation (Legacy Characterization)

Autonomous investigation of existing systems to characterize behavior. The legacy entry path for advancing scenarios from `captured` to `characterized`.

## When to Use

An existing system has behavior that is unknown, undocumented, or untested. Build understanding before the human can confirm intent. This path is for `observed` mode scenarios — skip for greenfield (`intended` mode).

## Investigation Activities

1. Trace the code path from entry point (route, event listener, UI component) to effect (database write, API response, DOM update)
2. Identify seams where tests can attach
3. Note constraints that shape the behavior (schemas, validation, config)
4. Capture current behavior with approval tests as evidence
5. Record findings as artifacts

## Seam Types

A seam is where you can observe or intercept behavior without modifying source.

| Seam Type | What to Look For | Test Attachment |
|-----------|------------------|-----------------|
| Function boundary | Exported function with clear inputs/outputs | Call directly with controlled inputs |
| Constructor injection | Dependencies passed in, not hard-coded | Substitute with test doubles |
| Config point | Behavior controlled by env/config | Override config in test setup |
| Middleware/hooks | Interception points in a pipeline | Insert test middleware |
| API boundary | HTTP endpoints with request/response contracts | Call endpoint, assert response |
| Rendering output | UI components producing deterministic HTML/pixels | Screenshot comparison |

**Finding seams:**
1. Start from the observed behavior. Trace from entry point to effect.
2. At each function boundary, ask: "Can I call this in isolation with controlled inputs?"
3. Mark boundaries where the answer is yes.
4. If no clean seams exist, look one level out — can you intercept at the caller?

## Characterize with Approval Tests

Approval tests capture what the system actually does, not what it should do. They are evidence, not specification.

**Structural approvals** — for data outputs (API responses, computed values):
Use `approve(value)` from `@aver/approvals`. First run captures the baseline. Subsequent runs compare.

**Visual approvals** — for rendered UI:
Use `approve.visual('name')`. Requires a `screenshotter` extension from the protocol.

Approval baselines are evidence for the mapping session. They show the human exactly what the system does today.

## Confidence Reporting

Report confidence levels for each finding:
- **Confirmed**: directly evident in code (explicit validation, database schema, test output)
- **Inferred**: pattern-based reasoning (naming conventions, similar code paths, comments)
- **Speculative**: partial evidence, needs human verification

Present uncertain items prominently. They become the starting agenda for the mapping conversation.

## Output

A characterized scenario has:
- Execution path documented (entry point through to effect)
- Seams identified with test attachment strategy
- Constraints framed as business rules in domain language (e.g., "a task must have a title"), not implementation details (e.g., "validation in TaskService.create()"). Implementation locations belong in seams, not constraints.
- Approval baselines captured as evidence
- Confidence level for each finding
- Questions posted for anything requiring human judgment

## How This Feeds Scenario Mapping

Characterized scenarios carry evidence into the mapping session:
- Approval baselines show what the system actually does
- Seam analysis tells where tests will attach
- Constraints become candidate rules during Example Mapping
- Open questions become the starting agenda

## Graduating Approval Tests

Approval tests are a starting point, not a destination. As scenarios advance through mapping and specification, replace approval tests with named domain assertions:
- Approval tests lock down the entire output (brittle, but comprehensive)
- Named assertions check specific properties (resilient, but targeted)
- Graduate incrementally — keep approvals alongside named assertions until coverage is confirmed

## Anti-Patterns

- **Approving baselines without reviewing.** First run captures whatever the system does. Inspect before accepting.
- **Modifying code before capturing.** Capture current behavior first. Changes come after the safety net exists.
- **Testing through only one seam.** Legacy systems often have inconsistencies between API, UI, and internal logic. Capture at multiple seams.
- **Skipping seam analysis.** Without seams, tests require the full system running. Find the narrowest seam that exercises the behavior.
- **Presenting findings without confidence levels.** The human needs to know which findings are solid vs speculative.

> **Human interaction:** In the CycleEngine, set `suggestedNext` to describe what needs human input — the supervisor will issue `ask_user`. In Claude Code, interact directly or use `add_question` MCP tool.
