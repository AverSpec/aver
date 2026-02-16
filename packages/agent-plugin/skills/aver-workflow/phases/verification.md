# Phase: Verification

All formalized items have domain links -- domain operations are defined, tests are written, adapters are implemented. Your job is to run the full test suite, review coverage, and confirm everything is solid.

## Active Perspectives

All three perspectives participate in the review:

- **Business** -- Are the right behaviors being tested? Does the domain language make sense?
- **Development** -- Are there architectural concerns? Missing error paths? Adapter gaps?
- **Testing** -- Is coverage complete? Are edge cases handled? Do all protocols pass?

## What to Do

### 1. Run the Full Test Suite

Run tests without any filters to get the complete picture:

```
Call run_tests (no filters)
```

All tests across all domains and all protocols should pass. If anything fails, address it before continuing.

### 2. Investigate Failures

If tests fail, use the failure and trace tools to diagnose:

```
Call get_failure_details
  → See error messages, expected vs actual, stack traces

Call get_test_trace with testName: "<failing test name>"
  → See the action trace leading to the failure
```

For each failure, determine:
- **Implementation bug** -- Fix the adapter handler and re-run.
- **Test bug** -- Fix the test expectation and re-run.
- **Domain design issue** -- The operation does not match the behavior. Discuss with the human before changing the domain.
- **Flaky test** -- Run twice to confirm. If it intermittently passes/fails, fix the root cause (usually async timing or shared state).

### 3. Compare to Previous Runs

```
Call get_run_diff
```

This shows:
- **Newly passing** -- Tests that failed before but pass now. Good progress.
- **Newly failing** -- Tests that passed before but fail now. Regressions to investigate.
- **Still failing** -- Persistent failures that need attention.

No newly failing tests should exist when entering verification. If they do, go back to the implementation phase to fix them.

### 4. Review Coverage Gaps

Check each formalized item against its linked tests:

```
Call get_workspace_items with stage: "formalized"
```

For each item, verify:
- **Domain operation linked?** The `domainOperation` field should be set.
- **Test names linked?** The `testNames` field should list the relevant tests.
- **All examples covered?** Compare the Example Mapping examples from the formalization rationale against the actual test names. Are any examples missing tests?

Common coverage gaps:
- **Error paths not tested** -- Happy path passes, but validation errors or edge cases are not covered.
- **Protocol coverage uneven** -- Unit tests pass, but HTTP or Playwright adapters are not implemented.
- **Missing assertions** -- Tests perform actions and queries but do not assert the expected outcome.

### 5. Cross-Protocol Verification

If multiple adapters exist, verify that all protocols produce the same results:

```
Call run_tests with adapter: "unit"
Call run_tests with adapter: "http"
Call run_tests with adapter: "playwright"
```

The same tests should pass against every adapter. If a test passes for `unit` but fails for `http`, the HTTP adapter has a bug.

### 6. Review with the Human

Present a summary to the human for final review:

```
Verification summary for "task-board" domain:

Tests: 12 passing, 0 failing
Protocols: unit (12/12), http (12/12)
Formalized items: 4/4 linked to domain operations

Coverage by story:
- task-creation: 6 tests (createTask, validation, defaults)
- task-lifecycle: 4 tests (status transitions, completion)
- task-queries: 2 tests (getTask, getTaskCount)

All Example Mapping examples have corresponding tests.
No open questions remain in the workspace.

Does this coverage look complete? Are there any behaviors I should add tests for?
```

### 7. Export the Workspace

Once the human approves, export the workspace as a record:

```
Call export_workspace with format: "json"
  → Portable backup of the entire workspace

Call export_workspace with format: "markdown"
  → Human-readable summary for documentation or PR descriptions
```

The markdown export is useful for pull request descriptions -- it shows the progression from observation through formalization with full rationale at each step.

## MCP Tools for This Phase

| Tool | When to Use |
|------|------------|
| `run_tests` | Run the full suite (no filters) or per-protocol. |
| `get_failure_details` | Diagnose any failures. |
| `get_test_trace` | Trace execution for a specific failing test. |
| `get_run_diff` | Compare to previous runs. Look for regressions. |
| `get_workspace_items` | Review formalized items and their domain links. |
| `export_workspace` | Export workspace as JSON (backup) or markdown (documentation). |
| `get_workspace_summary` | Quick count of items by stage and open questions. |

## CLI Alternative

```bash
aver run
aver workspace items --stage formalized
aver workspace export --format markdown
aver workspace export --format json
```

## Human Feedback Triggers

1. **Final coverage review** -- "Here is the full test summary. Does this coverage look complete?"
2. **Domain language review** -- "The domain operations are named: createTask, getTask, taskExists, hasValidationError. Do these names still feel right after seeing them in tests?"
3. **Missing scenarios** -- "I have tests for creation, validation, and queries. Should I add tests for concurrent access, large payloads, or permission checks?"
4. **Protocol gaps** -- "Unit and HTTP adapters both pass. Do you want a Playwright (UI) adapter as well?"

## Exit Criteria

The verification phase is complete when:

- [ ] All tests pass across all protocols
- [ ] `get_run_diff` shows no regressions (no newly failing tests)
- [ ] Every formalized item has `domainOperation` and `testNames` linked
- [ ] Every Example Mapping example has a corresponding test
- [ ] No open questions remain in the workspace
- [ ] The human has reviewed and approved the coverage
- [ ] Workspace is exported (JSON backup and/or markdown summary)

## What Happens Next

Verification is the final phase. After completion:

- **The workspace is a living record.** It persists between sessions. Future work can add new observations and start the pipeline again.
- **New features restart at kickoff.** Record new intents or observations and the phase detection will route you to the appropriate phase.
- **Regressions demote items.** If a passing test starts failing due to changed requirements, demote the formalized item back to intended (with `demote_item`) and re-run formalization and implementation.

The pipeline is not a one-shot process. It is a cycle. Every new behavior starts as an observation or intent and progresses through the same phases.
