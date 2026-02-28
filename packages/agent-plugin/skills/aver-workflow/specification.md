# Specification (Domain + Adapter Interface Design)

Transform `mapped` scenarios into domain vocabulary and adapter interface definitions. The bridge between business language and executable code.

## Input

Scenarios at `mapped` stage with: rules, examples, resolved questions, human-confirmed intent.

## Naming Vocabulary

Derive operation names from the examples' given/when/then structure:

| Example Part | Operation Type | Naming Pattern |
|-------------|----------------|----------------|
| Given (setup state) | `action` | verb + noun: `createTask`, `addItem` |
| When (trigger) | `action` | verb + noun: `cancelOrder`, `applyDiscount` |
| Then (check outcome) | `assertion` | predicate: `taskExists`, `hasValidationError` |
| Then (read state) | `query` | get + noun: `getTaskCount`, `getOrderTotal` |

**Naming rules:**
- Use ubiquitous language, not implementation details. `createTask` not `postToTaskEndpoint`.
- Actions describe WHAT to do, not HOW.
- Queries describe WHAT the system knows.
- Assertions describe WHAT to check.

## Human Confirms Names

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

After human approves names, use `describe_adapter_structure` MCP tool to show handler signatures. Review with the human if the handler shapes look correct.

## Adapter-First Design

Design pressure flows from the outside in:

1. **Examples** define what the test needs to express
2. **Domain vocabulary** names the operations
3. **Adapter interface** defines handler signatures
4. **Handler implementation** drives the application code design

The adapter boundary is the primary test surface. Sociable tests at this boundary validate behavior without mocking internals.

## Output

A `specified` scenario has:
- Domain operations named (human-approved)
- Adapter handler signatures documented
- Ready for TDD implementation

The domain file and adapter handlers are written during the `implemented` stage, not here.

## Anti-Patterns

- **Writing domain code before human approves names.** Vocabulary is the shared language. Confirm first.
- **Designing from implementation concerns.** Derive names from examples, not from database schemas or API endpoints.
- **Skipping adapter interface review.** The adapter interface is where domain meets protocol. Verify handler shapes.
- **Implementing during specification.** This stage defines WHAT to build. The inner loop handles HOW.

> **Human interaction:** Present the proposed vocabulary directly and wait for explicit confirmation before writing any domain code.
