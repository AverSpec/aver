# Perspective: Testing

**Central question: How do we verify it?**

The Testing perspective designs examples, names domain operations, and writes executable tests. When you adopt this perspective, you stop asking "what does it do?" or "should it do this?" and focus on "how do we prove it works?" Every intended behavior needs concrete examples that demonstrate correctness.

## What This Perspective Drives

- **Example generation.** Each intended behavior becomes a set of concrete examples through Example Mapping. An example has a given condition, an action, and an expected outcome. Examples are the raw material for tests.
- **Domain vocabulary design.** The Testing perspective proposes names for actions, queries, and assertions. These names become the shared language between business, code, and tests. Naming is a collaborative act -- the Testing perspective proposes, the human confirms.
- **Test implementation.** The Testing perspective writes Aver test files using `suite()`, `test()`, `act`, `query`, and `assert` proxies. Tests use only domain vocabulary, never adapter details.
- **Edge case discovery.** Happy paths are obvious. The Testing perspective asks: What about empty inputs? Boundary values? Concurrent operations? Error conditions? Race conditions?

## Owned Promotions

### intended to formalized

This is the Testing perspective's primary gate. An intended item has been confirmed by business as desired behavior. The Testing perspective decomposes it through Example Mapping and promotes with the full results.

```
Call promote_item with:
  id: "<item ID>"
  rationale: "Example Mapping complete.
    Story: Users can create tasks with a title and default 'todo' status.
    Rules:
    - Title is required
    - Title max 200 characters
    - Default status is 'todo'
    - Status must be one of: 'todo', 'in-progress', 'done'
    Examples:
    1. Given valid title -> create task -> task exists with status 'todo'
    2. Given empty title -> create task -> validation error 'title is required'
    3. Given 201-char title -> create task -> validation error 'title too long'
    4. Given valid title + explicit status -> create task -> task has specified status
    Domain operations: createTask, taskExists, taskCount, hasValidationError"
  promotedBy: "testing"
```

The rationale for this promotion is the richest in the pipeline. It contains the rules, the examples, and the proposed domain operations. This rationale becomes the blueprint for the implementation phase.

## Key Questions to Ask

When adopting the Testing perspective, filter everything through these questions:

1. **"What examples prove this?"** -- For each rule, what concrete scenario demonstrates it? An example without specifics ("it should work") is not an example.
2. **"What edge cases exist?"** -- What happens at boundaries? Zero items, one item, maximum items. Empty strings, very long strings. Null versus undefined versus missing.
3. **"What is the domain operation name?"** -- Use business language. `createTask` not `postTaskEndpoint`. `taskExists` not `responseStatusIs200`. The name should make sense to someone who has never seen the code.
4. **"How do we assert this?"** -- What does "correct" look like? A specific count? A specific state? The absence of something? Assertions must be precise and deterministic.
5. **"What is the given state?"** -- Every example starts from a known state. What setup is needed? What preconditions must be true?
6. **"Is this testable through all protocols?"** -- A domain-level test should work whether the adapter uses unit, HTTP, or Playwright. If an example only works through one protocol, the domain vocabulary may be wrong.

## MCP Tools

| Tool | How This Perspective Uses It |
|------|------------------------------|
| `get_workspace_items` | List intended items ready for Example Mapping. Filter by `stage: "intended"`. |
| `promote_item` | Move items from intended to formalized with complete Example Mapping rationale. Always use `promotedBy: "testing"`. |
| `link_to_domain` | Connect formalized items to their Aver domain operations and test names. |
| `describe_domain_structure` | Generate a CRUD domain template as a starting point for vocabulary design. |
| `run_tests` | Run the test suite after writing tests. Filter by domain or adapter. |
| `get_failure_details` | Inspect test failures -- error messages, stack traces, action traces. |
| `get_test_trace` | Get the full execution trace for a specific test to understand what happened. |
| `get_run_diff` | Compare current and previous runs to confirm newly passing tests and catch regressions. |
| `add_question` | Record questions discovered during Example Mapping: "Should whitespace-only titles be treated as empty?" |
| `get_promotion_candidates` | Find intended items with no open questions ready for formalization. |

## In Single-Session Mode

When running as a solo agent, the Testing perspective is active during formalization and parts of implementation:

1. **During formalization.** This is the primary perspective. For each intended item, run Example Mapping:
   - State the story (one sentence)
   - Extract rules (business constraints)
   - Generate examples for each rule (given/when/then)
   - Capture questions (ambiguities found during example generation)
   - Propose domain operation names

2. **During implementation.** The Testing perspective writes test files and domain definitions. The Development perspective writes adapter handlers. In single-session mode, alternate between them:

   ```
   [Testing perspective]
   "Writing the test for task creation. The domain needs a `createTask` action
   and a `taskExists` assertion..."

   [Switch to Development perspective]
   "Now implementing the unit adapter handler for `createTask`. The Board class
   needs a create() method that validates the title..."

   [Switch back to Testing perspective]
   "Running tests to check: Call run_tests with domain: 'task-board'
   Two tests pass, one fails on the validation edge case..."
   ```

3. **During verification.** The Testing perspective reviews test coverage. Are all examples from Example Mapping covered by actual tests? Are there gaps?

## Example Mapping Reference

Example Mapping is the core technique of the Testing perspective. The full process has five steps: (1) state the story as a single sentence, (2) extract rules (business constraints), (3) generate concrete examples for each rule as given/when/then, (4) capture questions for any ambiguity, (5) propose domain operation names mapped from the examples.

See `phases/formalization.md` for the complete Example Mapping walkthrough with detailed examples.

## Human Feedback

### ALWAYS ask the human:

- **When naming domain operations.** "I propose calling this action `createTask` with payload `{ title: string; status?: string }`. Does this match how you talk about this behavior?" Domain names are the shared vocabulary -- they must make sense to both business and development.
- **When examples reveal ambiguity.** "While generating examples for title validation, I realized: should whitespace-only titles be treated as empty? This affects whether we need a separate validation rule."

### Ask the human when:

- **Coverage feels incomplete.** "I have examples for creation and validation. Are there other scenarios I should consider? Concurrent creation? Duplicate titles?"
- **Operation scope is unclear.** "Should `createTask` handle both simple creation and creation with assignment, or should those be separate actions?"
- **Assertion granularity is uncertain.** "Should `taskExists` check only presence, or also verify the task's properties?"

### Do NOT ask the human:

- About test implementation details (how to write the code)
- About adapter-specific mechanics (which selectors, which endpoints)
- About Aver framework usage patterns (how to call `suite()` or `test()`)

## Anti-Patterns

- **Skipping Example Mapping.** Going straight to writing tests without first decomposing into rules and examples produces tests that cover happy paths and miss edge cases.
- **Using implementation language in tests.** `await act.postToTasksEndpoint(...)` leaks adapter details into the domain. Use `await act.createTask(...)`.
- **Writing adapter-specific tests.** If a test only works with one adapter, the domain vocabulary is likely wrong. Domain tests should be protocol-agnostic.
- **Naming in isolation.** Domain operation names are a shared decision. Do not finalize names without human confirmation.
- **Ignoring questions.** Questions discovered during Example Mapping are valuable signals. Record them with `add_question` rather than glossing over ambiguity.
- **Over-specifying examples.** Each example should test one rule. If an example requires elaborate multi-step setup, consider whether it is actually testing multiple rules and should be split.
