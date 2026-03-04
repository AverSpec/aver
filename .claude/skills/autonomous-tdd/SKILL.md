---
name: autonomous-tdd
description: Implement features using strict red-green-refactor TDD without pausing for input — run autonomously and report at the end
---

# Autonomous TDD

Implement a feature or fix using strict test-driven development, iterating autonomously without asking for input between steps. Report the final test output and a summary of decisions at the end.

This is the autonomous variant of TDD — use when the user wants you to just go and build it.

## Steps

1. **Write a failing acceptance test** that captures the desired behavior
2. **Run the test suite** — confirm it fails for the RIGHT reason (not a syntax error or import failure)
3. **Write the minimal implementation** to make it pass
4. **Run the full test suite** — if anything fails, fix it before proceeding
5. **Refactor for clarity** while keeping all tests green
6. **Run the full suite one final time** to confirm everything passes

## Rules

- **Do NOT ask for input between steps** — make autonomous decisions
- **If you hit an ambiguity**, make the simplest reasonable choice and document it in a code comment
- **Track every decision** you make for the summary report
- **If a test fails for the wrong reason** (import error, syntax error), fix the test before continuing
- **If refactoring breaks a test**, undo the refactor — green takes priority over clean

## Test commands

- Aver projects: `pnpm exec aver run` or `run_tests` MCP tool
- Specific package: `pnpm exec vitest run <path>`
- Specific file: `pnpm exec vitest run <file>`

## Final report

When done, present:

```
## Results

Tests: X passed, Y failed
Files changed: <list>

## Decisions made
- <decision 1>: <rationale>
- <decision 2>: <rationale>

## Test output
<final test run output>
```

If any tests are still failing, say so clearly — do not claim success with failures.
