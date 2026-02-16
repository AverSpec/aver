# Pattern: Example Mapping

Matt Wynne's Example Mapping technique for structured discovery of rules, examples, and questions. This is the primary technique during the **formalization** phase.

## When to Use This Pattern

You have intended items in the workspace -- behaviors confirmed by the business as desired. Before writing any tests, you need to decompose each behavior into testable pieces. Example Mapping provides a structured format for doing this.

## The Four Card Colors

Example Mapping uses four types of cards, each represented by a color. In the Aver workspace, they map to specific data structures:

| Card | Color | Purpose | Workspace Mapping |
|------|-------|---------|-------------------|
| Story | Yellow | The behavior being discussed | Workspace item (intended stage) |
| Rule | Blue | A business constraint or invariant | Item's `rules[]` array |
| Example | Green | A concrete scenario proving a rule | Item's `examples[]` array |
| Question | Red | An unresolved ambiguity | Item's `questions[]` via `add_question` |

## The Session Format

### Solo Mode

When working alone or as a solo agent, run Example Mapping as a structured self-interrogation:

1. **Read the intended item.** Its behavior description is the story.
2. **Extract rules.** What constraints govern this behavior? What invariants must hold?
3. **Generate examples.** For each rule, create at least two concrete scenarios -- one that satisfies the rule and one that violates it.
4. **Capture questions.** Any time you are uncertain, record a question rather than guessing.
5. **Propose domain operations.** Map examples to Aver action/query/assertion names.

### Facilitated Mode (with a human)

When the human is available, run the session interactively:

1. **State the story.** Read the behavior description aloud. "This story is about users creating tasks with a title and a default status."
2. **Ask for rules.** "What business rules govern task creation?" Let the human drive. Record each rule.
3. **Walk through examples together.** For each rule, collaboratively generate concrete scenarios. "If the title is empty, what should happen?"
4. **Surface questions.** When disagreement or ambiguity arises, do not resolve it on the spot. Record it as a question and move on.
5. **Time-box.** A single Example Mapping session should take 5-15 minutes per story. If a story generates more than 8 rules, it is too large. Split it.

## Worked Example

### Story

```
"Users can create tasks with a title and default 'todo' status"
```

### Rules

```
Rule 1: Title is required
Rule 2: Title maximum length is 200 characters
Rule 3: Default status is 'todo' when not specified
Rule 4: Status must be one of: 'todo', 'in-progress', 'done'
Rule 5: Task titles must be unique within a board
```

### Examples

```
Rule 1: Title is required
  Example 1.1: Given valid title "Fix login bug" -> create task -> task exists with title "Fix login bug"
  Example 1.2: Given empty string "" -> create task -> validation error "title is required"
  Example 1.3: Given missing title (undefined) -> create task -> validation error "title is required"

Rule 2: Title maximum length is 200 characters
  Example 2.1: Given title of exactly 200 characters -> create task -> succeeds
  Example 2.2: Given title of 201 characters -> create task -> validation error "title too long"

Rule 3: Default status is 'todo'
  Example 3.1: Given title "My Task" with no status -> create task -> task has status 'todo'
  Example 3.2: Given title "My Task" with status 'in-progress' -> create task -> task has status 'in-progress'

Rule 4: Status must be valid
  Example 4.1: Given status 'done' -> create task -> succeeds
  Example 4.2: Given status 'archived' -> create task -> validation error "invalid status"

Rule 5: Unique titles
  Example 5.1: Given existing task "Fix bug" -> create task "Fix bug" -> validation error "title already exists"
```

### Questions

```
Question 1: Should whitespace-only titles (e.g., "   ") be treated as empty?
Question 2: Is title uniqueness case-sensitive? ("Fix Bug" vs "fix bug")
Question 3: Can a task's title be changed after creation?
```

## Recording in the Workspace

### Rules and examples go in the promotion rationale

When promoting an item to formalized, include the full Example Mapping results:

```
Call promote_item with:
  id: "<item ID>"
  rationale: "Example Mapping complete.
    Story: Users can create tasks with a title and default 'todo' status.
    Rules:
    1. Title is required
    2. Title max 200 characters
    3. Default status is 'todo'
    4. Status must be valid enum
    5. Titles unique within board
    Examples: 10 concrete scenarios covering happy path, validation errors,
    boundary values, and uniqueness constraint.
    Domain operations: createTask, taskExists, taskCount, hasValidationError
    Open questions: whitespace handling, case-sensitive uniqueness, title mutability"
  promotedBy: "testing"
```

### Questions become workspace questions

```
Call add_question with:
  itemId: "<item ID>"
  text: "Should whitespace-only titles be treated as empty?"
```

Resolve questions when the human answers:

```
Call resolve_question with:
  itemId: "<item ID>"
  questionId: "<question ID>"
  answer: "Yes, whitespace-only titles should be rejected with the same error as empty titles."
```

## Mapping Examples to Domain Operations

Each example naturally decomposes into Aver domain operations. This mapping bridges from business language to test code.

### The mapping pattern

Each example has three parts that map to Aver operations:

| Example Part | Aver Operation | Role |
|-------------|----------------|------|
| Given (precondition) | `act.*` | Setup actions to establish state |
| When (trigger) | `act.*` | The action under test |
| Then (outcome) | `assert.*` or `query.*` + `expect` | Verification of the result |

### Example mapping

```
Example: "Given empty title -> create task -> validation error 'title is required'"

  Given: (no setup needed -- empty board)
  When:  act.createTask({ title: '' })
  Then:  assert.hasValidationError({ field: 'title', message: 'title is required' })

Domain operations used:
  - Action: createTask (payload: { title: string; status?: string })
  - Assertion: hasValidationError (payload: { field: string; message: string })
```

### Each example becomes a test case

```typescript
test('rejects empty title', async ({ act, assert }) => {
  await act.createTask({ title: '' })
  await assert.hasValidationError({ field: 'title', message: 'title is required' })
})
```

### Each rule becomes one or more assertions

Rules map to assertions because they represent invariants that must always hold:

| Rule | Assertion |
|------|-----------|
| Title is required | `hasValidationError({ field: 'title', ... })` |
| Default status is 'todo' | `taskInStatus({ title, status: 'todo' })` |
| Titles must be unique | `hasValidationError({ field: 'title', message: 'already exists' })` |

## Signals That a Story Is Too Large

During Example Mapping, watch for these signals. If any appear, split the story before continuing:

- **More than 8 rules.** The behavior is too broad. Split by capability.
- **Rules that contradict each other.** Two rules that cannot both be true indicate two different stories.
- **Examples that require multi-step setup spanning multiple features.** The story crosses domain boundaries.
- **The session exceeds 15 minutes.** Complexity is a signal of scope.
- **More questions than examples.** The story is not well-enough understood for formalization. Send it back to discovery.

## MCP Tools for This Pattern

| Tool | When to Use |
|------|------------|
| `get_workspace_items` | List intended items ready for Example Mapping. Filter by `stage: "intended"`. |
| `add_question` | Record questions discovered during the session. |
| `resolve_question` | Mark a question as answered when the human responds. |
| `promote_item` | Move items to formalized with full Example Mapping rationale. |
| `get_promotion_candidates` | Find items with all questions resolved, ready for promotion. |

## Anti-Patterns

- **Skipping rules, going straight to examples.** Rules give examples structure. Without rules, you generate random scenarios instead of systematic coverage.
- **Resolving questions by guessing.** The entire point of the question card is to defer decisions that need human input. Record the question, do not fabricate an answer.
- **Writing code during the session.** Example Mapping produces English-language examples and proposed operation names, not TypeScript. Code comes in the implementation phase.
- **Mapping one example to one test with excessive setup.** If an example requires creating 10 other entities first, the example may be testing multiple rules. Split it.
- **Naming operations in implementation language.** `postToTaskEndpoint` is an adapter detail. `createTask` is domain language. Example Mapping should produce domain names.
