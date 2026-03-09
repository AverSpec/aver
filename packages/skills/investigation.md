# Investigation (Legacy Characterization)

Autonomous investigation of existing systems to characterize behavior. The legacy entry path for advancing scenarios from `captured` to `characterized`.

## When to Use

An existing system has behavior that is unknown, undocumented, or untested. Build understanding before the human can confirm intent. This path is for `observed` mode scenarios — skip for greenfield (`intended` mode).

## Investigation Activities

1. Trace the code path from entry point (route, event listener, UI component) to effect (database write, API response, DOM update)
2. Identify seams where tests can attach
3. Note constraints that shape the behavior — express these as **business rules in domain language** (see Output section for format)
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
- Constraints framed as **business rules in domain language**, not implementation details. Implementation locations belong in **seams**, not constraints.

**Good constraints** (domain language — what a product owner would say):
- "A task must have a title"
- "New tasks default to the 'todo' stage"
- "A human must confirm intent before domain design begins"

**Bad constraints** (implementation details — what a developer would grep for):
- "Validation in TaskService.create() checks title is non-empty"
- "Default status set in database migration 003"
- "confirmedBy field must be non-falsy string"

The implementation details go in **seams** — that's where you document which function validates, which table stores, which config controls the behavior.
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

## Crossing Point: Investigation → Scenario Capture

After presenting findings, **immediately propose scenarios to capture**. Don't wait for the human to ask — every distinct behavior you observed is a candidate.

Say to the human:
> "Before I share findings — who else should review these? A product owner for intent, a tester for edge cases, a developer for feasibility?"

Then present findings:

> "Based on this investigation, I see [N] distinct behaviors:
>
> 1. **[behavior]** — [confidence level]. [one-line evidence summary]
> 2. **[behavior]** — [confidence level]. [one-line evidence summary]
> 3. **[behavior]** — [confidence level]. [one-line evidence summary]
>
> Should I capture these as scenarios? Any that should be combined, split, or skipped?"

For each behavior the human confirms:
- Run `packages/agent-plugin/scripts/gh/scenario-capture.sh --title "..." --body "..."` with `mode: observed` and the behavior description
- Attach seams and constraints by updating the structured issue body via `gh issue edit <number> --body "..."`
- Link approval baselines by updating the "Domain Link" section in the issue body via `gh issue edit`
- Post open questions via `packages/agent-plugin/scripts/gh/scenario-question.sh <number> --body "..."` for speculative findings

Then transition to Example Mapping for each captured scenario. The investigation evidence becomes input to the mapping session — approval baselines show what the system does, seams show where tests attach, constraints become candidate rules.

## Anti-Patterns

- **Approving baselines without reviewing.** First run captures whatever the system does. Inspect before accepting.
- **Modifying code before capturing.** Capture current behavior first. Changes come after the safety net exists.
- **Testing through only one seam.** Legacy systems often have inconsistencies between API, UI, and internal logic. Capture at multiple seams.
- **Skipping seam analysis.** Without seams, tests require the full system running. Find the narrowest seam that exercises the behavior.
- **Presenting findings without confidence levels.** The human needs to know which findings are solid vs speculative.
- **Waiting for the human to ask for scenarios.** Proactively propose scenario captures after presenting findings. The investigation's purpose is to feed the pipeline.
