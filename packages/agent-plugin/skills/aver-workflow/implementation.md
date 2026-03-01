# Inner Loop (ATDD / TDD)

The implementation loop for advancing scenarios from `specified` to `implemented`. Drives domain code, adapter handlers, and tests through the ATDD double loop with disciplined refactoring.

## The Double Loop

The **outer loop** is the Aver acceptance test — it stays RED until the feature is complete. The **inner loop** is unit-level TDD that drives implementation one behavior at a time.

```
Outer: Write acceptance test (RED) ─────────────────────────────────────┐
Inner:   Write unit test (RED) → Implement (GREEN) → Refactor (CLEAN) │
Inner:   Write unit test (RED) → Implement (GREEN) → Refactor (CLEAN) │
Inner:   ...repeat until outer goes GREEN ◄─────────────────────────────┘
```

The acceptance test is the compass. The unit tests are the steps.

## Process

1. Run the acceptance test to see the current failure (`run_tests` MCP tool or `pnpm exec aver run`)
2. Read the error message and trace (`get_failure_details`, `get_test_trace` MCP tools)
3. Identify the smallest change to make progress
4. If the failure is in **app code**: write a unit test for just that behavior, make it pass, run the acceptance test again
5. If the failure is in the **adapter**: fix the adapter binding, run again
6. If **GREEN**: run the full suite to check regressions (`get_run_diff` MCP tool)
7. If still RED with the **same error** after 3 attempts: report status as "stuck"
8. If RED with a **different error**: that's progress — go to step 2

## Working with Legacy Code

When modifying existing systems, choose the strategy that minimizes risk:

- **Sprout method/class**: add new behavior alongside existing code without modifying it. Wire in at the call site.
- **Wrap method**: preserve the original method, wrap it with before/after behavior.
- **Extract and override**: extract the part you need to change, override it in a test subclass or via dependency injection.

Characterization tests (from the investigation phase) are your safety net. Keep them running alongside new tests until confident in coverage.

## Test Design

**Sociable tests over isolated tests.** Test through the adapter boundary — real objects, real collaborators, real behavior. Only isolate when:
- External I/O (network, filesystem, database) — use nullables to provide in-memory implementations at infrastructure boundaries
- Non-determinism (time, randomness) — inject controlled sources
- Expensive operations that slow the test suite

**Nullables** for infrastructure boundaries: provide a "null" implementation that works in-memory with no external dependencies. The production implementation and the nullable share the same interface — the adapter doesn't know which it's using.

**Listen to the tests.** Hard-to-test code is hard-to-use code. If testing requires elaborate setup, the design has coupling problems. Common signals:
- Many constructor parameters → too many responsibilities
- Deep mocking chains → law of demeter violation
- Test setup duplicated everywhere → missing abstraction

## Refactoring

Refactor only on GREEN. Every refactoring move keeps tests passing. Common moves:

- **Extract method** when a block of code has a name waiting to get out
- **Replace conditional with polymorphism** when the same switch/if appears in multiple places
- **Introduce parameter object** when a function takes 4+ related parameters
- **Move method** when a method uses more of another object's data than its own
- **Replace magic values** with named constants or enum values

Use the tests as your refactoring safety net. Run after every move.

## Domain Linking

After tests are GREEN, link the scenario to domain artifacts:
- `domainOperation`: the primary domain operation (e.g., "Cart.addItem")
- `testNames`: the test names that verify this scenario

Without domain links, the scenario cannot advance to `implemented`.

## Parallel Dispatch

When multiple independent scenarios are at `specified`:
- **1 scenario:** Work directly on the current tree. No isolation needed.
- **2+ independent scenarios:** Dispatch each as a separate subagent with worktree isolation. Each subagent runs the full ATDD double loop independently.
- **Dependent scenarios** (shared domain, overlapping files): Work sequentially on the current tree to avoid merge conflicts.

Independence heuristic: scenarios targeting different domains or different adapter protocols are independent. Scenarios sharing a domain should be sequential.

## Anti-Patterns

- **Changing too many things at once.** One change per red-green cycle.
- **Skipping the unit test.** If the acceptance test failure points to app code, write the unit test first. The unit test is documentation of intent.
- **Ignoring regressions.** A new test passing but an old test failing is not progress.
- **Mocking everything.** Mocks verify implementation, not behavior. Use real objects at the adapter boundary.
- **Refactoring on RED.** Get to GREEN first, then refactor. Never refactor and change behavior simultaneously.
- **Gold-plating.** YAGNI. Implement only what the acceptance test requires. Resist the urge to add "obvious" features.
- **Reporting success without domain links.** The scenario needs `domainOperation` and `testNames` to advance.
