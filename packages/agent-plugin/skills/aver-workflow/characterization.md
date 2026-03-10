# Characterization

Lock in existing behavior by writing tests that capture what the system currently does. The safety net before making changes.

## When to Use

Existing code needs modification but has no tests. Write characterization tests first to detect unintended changes during refactoring or feature work.

## Process

1. Identify the behavior to characterize from the scenario description
2. Find the narrowest seam that exercises the behavior (see investigation skill for seam types)
3. Write domain vocabulary that describes CURRENT behavior (not desired)
4. Write an adapter that binds at the seam
5. Write acceptance tests using the vocabulary
6. Tests should pass immediately (GREEN) — if they fail, the adapter is wrong
7. Do NOT change app code — only write tests, domains, and adapters

## Choosing What to Characterize

Focus on behavior the scenario describes. Don't characterize the entire module — just the paths relevant to the scenario. The investigation phase identified seams and constraints; use those to scope the characterization.

## Approval Tests as Starting Point

Use `approve(value)` from `@aver/approvals` to capture complex outputs. Approval tests:
- Lock the full output (golden master pattern)
- Are brittle but comprehensive — good for characterization
- Graduate to named domain assertions as scenarios advance through mapping and specification

## Expressing What You Find

When documenting characterized behavior, describe it in **domain language**:

- **Good**: "Tasks with empty titles are rejected" (business constraint)
- **Bad**: "TaskValidator.validate() throws when title.length === 0" (implementation detail)

Implementation details (which function, which line, which table) go in **seams**. The behavioral description should read like something a product owner would recognize.

## From Characterization to Scenario Capture

Characterization tests document what the system DOES. Each characterized behavior is a candidate for scenario capture — run `packages/agent-plugin/scripts/&lt;backend&gt;/scenario-capture.sh --title "..." --body "..."` for each distinct behavior found. These scenarios carry characterization evidence (approval baselines, seams, constraints) into the Example Mapping session, where the human confirms whether the behavior is intended. Behaviors confirmed as intended advance through mapping to specification. Behaviors identified as bugs become new `intended` mode scenarios for correction.

## Anti-Patterns

- **Characterizing desired behavior.** Capture what the system DOES, not what you wish it did.
- **Changing app code.** If tests fail, fix the test or adapter, not the app.
- **Over-characterizing.** Focus on the scenario's behavior, not every edge case.
- **Skipping seam selection.** Without a clean seam, tests require the full system. Find the narrowest seam first.
