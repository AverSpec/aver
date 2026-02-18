# Specification (Domain + Adapter Interface Design)

Transform `mapped` scenarios into domain vocabulary and adapter interface definitions. This is the bridge between business language and executable code.

## Input

Scenarios at the `mapped` stage with:
- Rules extracted during Example Mapping
- Concrete given/when/then examples
- All questions resolved
- Human-confirmed intent

## Naming Vocabulary

Derive operation names from the examples' given/when/then structure:

| Example Part | Operation Type | Naming Pattern |
|-------------|----------------|----------------|
| Given (setup state) | `action` | verb + noun: `createTask`, `addItem` |
| When (trigger) | `action` | verb + noun: `cancelOrder`, `applyDiscount` |
| Then (check outcome) | `assertion` | predicate: `taskExists`, `hasValidationError` |
| Then (read state) | `query` | get + noun: `getTaskCount`, `getOrderTotal` |

**Rules for names:**
- Use business language, not implementation details. `createTask` not `postToTaskEndpoint`.
- Actions describe WHAT to do, not HOW.
- Queries describe WHAT the system knows.
- Assertions describe WHAT to check.

## Human Confirms Names (Checkpoint -- ALWAYS Ask)

Present proposed vocabulary to the human before writing any domain code:

```
For the "task creation" scenarios, I propose:

Actions:  createTask, deleteTask
Queries:  getTaskCount, getTask
Assertions:  taskExists, hasValidationError

Do these names match how you talk about this domain?
```

Wait for explicit approval. Names become the shared language between tests, adapters, and documentation. Getting them wrong is expensive to fix later.

## Define Adapter Interfaces

After human approves names, use `describe_adapter_structure` to show handler signatures:

```
Call describe_adapter_structure with:
  domain: "task-board"
  protocol: "unit"
```

This returns the handler structure with type signatures derived from the domain definition. Review with the human if the handler shapes look correct.

## Adapter-First Design

Implementation starts at the adapter boundary, not the domain definition. The design pressure flows:

1. **Examples** define what the test needs to express
2. **Domain vocabulary** names the operations
3. **Adapter interface** defines handler signatures
4. **Handler implementation** drives the application code design

This is adapter-first: the adapter interface shapes how application code is structured. Sociable unit tests at the adapter boundary validate behavior without mocking internals.

## Handoff to Implementation

When vocabulary is confirmed and interfaces defined, call `advance_scenario` with rationale summarizing the domain name, operations, and human approval. Then dispatch:

- **Delegate to** `superpowers:test-driven-development` for red/green/refactor
- Provide: domain name, operation names, examples from mapping, adapter interface signatures
- Monitor progress via `run_tests` and `get_run_diff`

A `specified` scenario has domain operations named and human-approved, adapter handler signatures documented, and is ready for TDD implementation by a subagent. The domain file and adapter handlers are written during `implemented`, not here.

## Anti-Patterns

- **Writing domain code before human approves names.** Vocabulary is the shared language. Confirm first.
- **Designing the domain from implementation concerns.** Derive names from examples, not from database schemas or API endpoints.
- **Skipping adapter interface review.** The adapter interface is where domain meets protocol. Verify handler shapes before implementation.
- **Implementing during specification.** This stage defines WHAT to build. The TDD skill handles HOW to build it.
