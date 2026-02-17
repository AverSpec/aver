# Phase: Implementation

Formalized items exist with Example Mapping results and proposed domain operations. Your job is to write actual Aver code: domain definitions, failing tests, and adapter handlers. This is the TDD inner loop.

## Active Perspectives

**Development** and **Testing** collaborate:

- **Development** writes adapter handlers (the "how does it work" code)
- **Testing** writes domain vocabulary and test cases (the "how do we verify it" code)

## What to Do

### 1. Review Formalized Items

```
Call get_workspace_items with stage: "formalized"
```

Each formalized item has rules, examples, and proposed domain operations in its rationale. These are your implementation blueprint.

### 2. Scaffold the Domain

Use `get_project_context` to find naming conventions and file locations, then use `describe_domain_structure` to generate a starting-point domain definition.

```
Call get_project_context
  → Tells you: domain files go in domains/, adapters in adapters/, tests in tests/

Call describe_domain_structure with:
  description: "task board"
  → Returns a CRUD template to customize
```

Create the domain file with operations from the formalization phase:

```typescript
// domains/task-board.ts
import { defineDomain, action, query, assertion } from '@aver/core'

export const taskBoard = defineDomain('task-board', {
  // Actions
  createTask: action<{ title: string; status?: string }>(),
  deleteTask: action<{ id: string }>(),

  // Queries
  getTaskCount: query<number>(),
  getTask: query<{ id: string }, { title: string; status: string } | null>(),

  // Assertions
  taskExists: assertion<{ id: string }>(),
  hasValidationError: assertion<{ field: string; message: string }>(),
})
```

Key rules for domain definitions:
- Use business language for operation names (not implementation details)
- Action payloads describe WHAT to do, not HOW
- Query return types describe WHAT the system knows
- Assertion parameters describe WHAT to check

### 3. Write Failing Tests First

Create a test file using the domain vocabulary. Each example from Example Mapping becomes a test case:

```typescript
// tests/task-board.spec.ts
import { suite } from '@aver/core'
import { taskBoard } from '../domains/task-board.js'

const { test, act, query, assert } = suite(taskBoard)

test('creates a task with default todo status', async () => {
  await act.createTask({ title: 'My Task' })
  const count = await query.getTaskCount()
  expect(count).toBe(1)
})

test('requires a title to create a task', async () => {
  await act.createTask({ title: '' })
  await assert.hasValidationError({ field: 'title', message: 'title is required' })
})

test('rejects titles longer than 200 characters', async () => {
  await act.createTask({ title: 'A'.repeat(201) })
  await assert.hasValidationError({ field: 'title', message: 'title is too long' })
})
```

Run the tests now -- they should all fail because no adapter exists:

```
Call run_tests with domain: "task-board"
```

Verify all tests fail with "no adapter" errors, not with unexpected exceptions.

### 4. Implement Adapter Handlers

Use `describe_adapter_structure` to see what handlers are needed:

```
Call describe_adapter_structure with:
  domain: "task-board"
  protocol: "unit"
  → Returns the handler structure with type signatures
```

Start with the `unit` protocol adapter (simplest, no external dependencies). The `implement()` function takes the domain, a protocol, and a handler object with one function per domain operation. TypeScript will flag any missing handlers at compile time.

### 5. Run the TDD Inner Loop

This is the core cycle. Repeat until all tests pass:

**Red:** Run tests, see failures.
```
Call run_tests with domain: "task-board"
```

**Green:** Implement the simplest handler that makes the next test pass.

**Refactor:** Clean up, then run tests again to make sure nothing broke.

```
Call get_failure_details  → See what is still failing
Call get_run_diff         → See what changed since last run
```

Work through one test at a time. Do not try to implement all handlers at once.

### 6. Add Protocol Adapters

Once unit tests pass, add adapters for other protocols (http, playwright). Each protocol adapter implements the same domain operations but through a different interface. Use `describe_adapter_structure` with the target protocol to see handler signatures.

The same tests run against all adapters automatically. Multi-adapter test names include the protocol: `"creates a task with default todo status [unit]"`, `"creates a task with default todo status [http]"`.

### 7. Link Formalized Items to Domain Operations

As you implement each domain operation, link the corresponding workspace items:

```
Call link_to_domain with:
  itemId: "<item ID>"
  domainOperation: "taskBoard.createTask"
  testNames: ["creates a task with default todo status", "requires a title to create a task"]
```

This connects the maturity pipeline back to the running code. The verification phase uses these links to check coverage.

## MCP Tools for This Phase

| Tool | When to Use |
|------|------------|
| `get_workspace_items` | List formalized items to implement. |
| `get_project_context` | Find file paths and naming conventions. |
| `describe_domain_structure` | Generate a domain template. |
| `describe_adapter_structure` | See handler signatures for a domain + protocol. |
| `run_tests` | Run tests (filter by domain or adapter). |
| `get_failure_details` | Inspect failures with error messages and traces. |
| `get_test_trace` | Get the execution trace for a specific test. |
| `get_run_diff` | Compare current run to previous -- see newly passing tests. |
| `link_to_domain` | Connect workspace items to implemented domain operations. |

## CLI Alternative

```bash
aver run --domain task-board
aver run --adapter unit
```

## Human Feedback Triggers

1. **Domain vocabulary naming** -- "I am defining `createTask` as an action with `{ title: string; status?: string }`. Does this match your domain language?" Confirm before writing tests.
2. **Adapter implementation questions** -- "The HTTP adapter needs to know the API endpoint for task creation. Is it `POST /api/tasks`?"
3. **Test coverage gaps** -- "The examples from formalization cover creation and validation. Should I also test concurrent creation or rate limiting?"

## Exit Criteria

Move to the verification phase when:

- [ ] Domain vocabulary is defined with all operations from formalization
- [ ] All tests from Example Mapping examples are written
- [ ] At least one adapter (unit) makes all tests pass
- [ ] All formalized items are linked to domain operations via `link_to_domain`
- [ ] `run_tests` shows all tests passing
- [ ] `get_run_diff` shows no regressions from previous runs

## What Happens Next

The **verification** phase activates when all formalized items have domain links. All three perspectives review: run the full suite, check for coverage gaps, and export a summary.

Call `get_workflow_phase` to confirm the transition.
