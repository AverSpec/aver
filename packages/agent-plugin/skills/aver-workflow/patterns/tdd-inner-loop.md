# Pattern: TDD Inner Loop

Red-green-refactor with Aver domain vocabulary. This is the core development cycle during the **implementation** phase.

## When to Use This Pattern

You have formalized items with Example Mapping results -- rules, examples, and proposed domain operations. Now you turn those into running code. The TDD inner loop ensures you write only the code needed to make tests pass, nothing more.

## The Cycle

```
Define domain operation
       |
       v
Write failing test   <-- RED
       |
       v
Implement adapter handler  --> GREEN
       |
       v
Refactor  --> still GREEN
       |
       v
(repeat for next operation)
```

Each cycle takes one domain operation from definition to passing test. Work through operations one at a time, not all at once.

## Step 1: Define the Domain Operation

Start from the Example Mapping output. Each proposed operation becomes an `action()`, `query()`, or `assertion()` marker in the domain definition.

```typescript
// domains/task-board.ts
import { defineDomain, action, query, assertion } from 'aver'

export const taskBoard = defineDomain({
  name: 'task-board',
  actions: {
    createTask: action<{ title: string; status?: string }>(),
  },
  queries: {
    taskDetails: query<{ title: string }, { title: string; status: string } | null>(),
  },
  assertions: {
    taskExists: assertion<{ title: string }>(),
    hasValidationError: assertion<{ field: string; message: string }>(),
  },
})
```

Key decisions: action payloads describe what to do, not how (`{ title: string }` not `{ endpoint: string, body: object }`). Query return types describe what the system knows (use `| null` for "not found"). Assertion payloads describe what to check (the handler throws on failure).

Use `describe_domain_structure` to generate a starting template.

## Step 2: Write the Failing Test (RED)

Each example from Example Mapping becomes a test case. The test uses only domain vocabulary -- no adapter details.

```typescript
// tests/task-board.spec.ts
import { suite } from 'aver'
import { taskBoard } from '../domains/task-board.js'

const { test } = suite(taskBoard)

test('creates a task with default todo status', async ({ act, query }) => {
  await act.createTask({ title: 'Fix login bug' })
  const task = await query.taskDetails({ title: 'Fix login bug' })
  expect(task).toEqual({ title: 'Fix login bug', status: 'todo' })
})

test('rejects empty title', async ({ act, assert }) => {
  await act.createTask({ title: '' })
  await assert.hasValidationError({ field: 'title', message: 'title is required' })
})
```

Run the tests now. They should fail because no adapter exists:

```
Call run_tests with domain: "task-board"
```

Verify the failures say "no adapter registered" or similar -- not unexpected runtime errors. If you see unexpected errors, the domain definition may have issues.

## Step 3: Implement the Adapter Handler (GREEN)

Use `describe_adapter_structure` to see the handler signatures:

```
Call describe_adapter_structure with:
  domain: "task-board"
  protocol: "unit"
```

Then implement the simplest handler that makes the test pass. See `patterns.md` for complete adapter code examples. The handler signature is always `async (context, payload) => returnValue` where context comes from the protocol's `setup()`.

Run tests again after each handler:

```
Call run_tests with domain: "task-board"
```

## Step 4: Read the Failure Trace

When a test fails, the trace shows exactly what happened:

```
Call get_test_trace with:
  testName: "rejects empty title [unit]"
```

The trace output looks like:

```
[FAIL] rejects empty title [unit]
  1. act.createTask({ title: '' })
  2. assert.hasValidationError({ field: 'title', message: 'title is required' })  ← FAILED
     Error: Expected validation error "title is required" but got "null"
```

Reading traces:
- Each line is a domain operation in execution order
- `[PASS]` / `[FAIL]` markers show which step failed
- The error message from the assertion handler appears inline
- If an action throws, the trace stops at that action

Use failure details for a broader view:

```
Call get_failure_details
```

This shows all failing tests with their error messages. Use `get_run_diff` to see what changed between runs:

```
Call get_run_diff
```

The diff shows newly passing, newly failing, and still-failing tests. Focus on newly failing tests first -- they indicate regressions.

## Step 5: Refactor

Once tests pass, clean up. The refactoring step changes implementation without changing behavior. Run tests after each refactoring change to confirm nothing broke.

Common refactoring moves:
- Extract shared state setup into the protocol factory
- Consolidate duplicate validation logic
- Rename internal variables for clarity (domain names are already finalized)

## Multi-Protocol Implementation

Implement adapters in order of feedback speed:

### 1. Unit adapter (fastest feedback)

Direct in-memory state manipulation. No I/O, no processes to start. Tests run in milliseconds. This is where you spend most of the red-green-refactor time.

### 2. HTTP adapter (medium feedback)

Tests through the API layer. Requires starting a server but no browser. Each handler makes HTTP requests:

```typescript
actions: {
  createTask: async (ctx, { title, status }) => {
    const res = await ctx.post('/api/tasks', { title, status })
    if (!res.ok) throw new Error(`Create failed: ${res.status}`)
  },
},
```

### 3. Playwright adapter (slowest feedback)

Tests through the browser UI. Requires a running server and browser. Each handler interacts with page elements:

```typescript
actions: {
  createTask: async (page, { title }) => {
    await page.getByTestId('new-task-input').fill(title)
    await page.getByTestId('create-btn').click()
    await page.getByTestId(`task-${title}`).waitFor()
  },
},
```

The same tests run against all adapters automatically. Multi-adapter test names include the protocol: `"creates a task [unit]"`, `"creates a task [http]"`, `"creates a task [playwright]"`.

## Linking Workspace Items

As you implement each domain operation, connect the corresponding workspace item to the code:

```
Call link_to_domain with:
  itemId: "<item ID>"
  domainOperation: "taskBoard.createTask"
  testNames: ["creates a task with default todo status", "rejects empty title"]
```

This closes the loop between the maturity pipeline and the running code. The verification phase uses these links to confirm full coverage.

## MCP Tools for This Pattern

| Tool | When to Use |
|------|------------|
| `describe_domain_structure` | Generate a CRUD domain template as a starting point. |
| `describe_adapter_structure` | See handler signatures for a domain + protocol. |
| `run_tests` | Run the suite. Filter by domain or adapter for focused feedback. |
| `get_failure_details` | Inspect failures with error messages and traces. |
| `get_test_trace` | Get the full trace for a specific test to understand what happened. |
| `get_run_diff` | Compare current and previous runs. Spot regressions immediately. |
| `link_to_domain` | Connect workspace items to implemented domain operations and test names. |
| `get_project_context` | Find file paths and naming conventions for new files. |

## Anti-Patterns

- **Implementing all handlers at once.** The TDD loop is one operation at a time. Implementing everything before running tests removes the feedback that drives the design.
- **Skipping the red step.** If you write a test that passes immediately, either the test is wrong or the behavior already existed. Investigate before moving on.
- **Starting with Playwright.** The browser adapter has the slowest feedback loop. Get the logic right with unit tests first, then add protocols.
- **Testing adapter details in domain tests.** `expect(response.status).toBe(200)` is an HTTP adapter detail. The domain test should use `assert.taskExists(...)` instead. Adapter-specific checks go in the adapter handler.
- **Ignoring the trace.** When a test fails, read the trace before changing code. The trace often reveals that the failure is in an earlier action, not the assertion.
- **Not linking workspace items.** Without links, the verification phase cannot confirm coverage. Link as you go, not as an afterthought.
