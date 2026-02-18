# Scenario Mapping (Example Mapping)

Structured conversation technique to extract rules, examples, and questions from a scenario. This is the core activity for advancing scenarios from `captured`/`characterized` to `mapped`.

Based on Matt Wynne's Example Mapping technique.

## When to Use

A scenario exists at the `captured` or `characterized` stage and needs to be decomposed into testable pieces before domain vocabulary can be designed. This applies to both entry paths:

- **Legacy**: scenario is `characterized` with evidence from investigation
- **Greenfield**: scenario is `captured` with stated intent from the human

## The Four Cards

| Card | Color | What It Is | How to Record |
|------|-------|------------|---------------|
| **Story** | Yellow | The scenario being discussed | The scenario's behavior description |
| **Rule** | Blue | A business constraint or invariant | Include in `advance_scenario` rationale |
| **Example** | Green | A concrete given/when/then proving a rule | Include in `advance_scenario` rationale |
| **Question** | Red | An unresolved ambiguity | `add_question` on the scenario |

## Session Flow

### 1. Present the scenario

Read the scenario's behavior description. State it as a single sentence. If the scenario is `characterized`, review the investigation evidence (approval baselines, seam analysis) first.

### 2. Extract rules

Ask: "What business rules govern this behavior?" Each rule is a single constraint or invariant.

If the human is available, let them drive. If working solo, derive rules from code investigation findings, approval baselines, and domain knowledge.

Rules are statements like:
- "Title is required"
- "Default status is 'todo' when not specified"
- "Task titles must be unique within a board"

### 3. Generate examples per rule

For each rule, generate at least two concrete examples -- one that satisfies the rule and one that violates it.

Each example has three parts:
- **Given**: precondition / initial state
- **When**: the action taken
- **Then**: the expected outcome

```
Rule: Title is required
  Example: Given empty title "" -> create task -> validation error "title is required"
  Example: Given valid title "Fix bug" -> create task -> task exists with title "Fix bug"

Rule: Default status is 'todo'
  Example: Given title with no status -> create task -> task has status 'todo'
  Example: Given title with status 'in-progress' -> create task -> task has status 'in-progress'
```

### 4. Capture questions

Any time there is ambiguity, record a question rather than guessing.

```
Call add_question with:
  itemId: "<scenario ID>"
  text: "Should whitespace-only titles be treated as empty?"
```

Do NOT resolve questions by fabricating answers. Either the human answers, or the question stays open.

### 5. Resolve or defer

Questions the human can answer immediately: resolve them with `resolve_question` and use the answer to refine rules/examples.

Questions that need more investigation or stakeholder input: leave open. The scenario cannot advance until all questions are resolved.

## When to Stop

Watch for these signals during the session:

- **More than 8 rules**: the scenario is too broad. Split it into multiple scenarios before continuing.
- **More questions than examples**: not enough understanding yet. Defer the session -- the scenario may need more investigation (regress to `characterized` or dispatch investigation).
- **Rules that contradict each other**: two separate scenarios masquerading as one. Split.
- **Examples requiring multi-step setup across features**: the scenario crosses domain boundaries. Split by domain.

## Output

After the session, the scenario should have:
- Rules listed (in the advancement rationale)
- Concrete given/when/then examples (in the advancement rationale)
- Questions captured (via `add_question`)
- All questions resolved (via `resolve_question`)

## Advancement to `mapped`

Prerequisites:
1. All questions on the scenario are resolved
2. The human confirms the rules and examples reflect their intent

**ALWAYS confirm with the human before advancing to `mapped`.** Present the rules, examples, and proposed scope. Wait for explicit approval.

```
Call advance_scenario with:
  id: "<scenario ID>"
  rationale: "Example Mapping complete.
    Rules: [title required, max 200 chars, default status 'todo', valid status enum, unique titles].
    Examples: 10 concrete scenarios covering happy path, validation, boundaries, uniqueness.
    Questions: 3 resolved (whitespace handling, case sensitivity, title mutability).
    Human confirmed intent."
  promotedBy: "agent"
```

## Mapping Examples to Domain Operations (Preview)

During the session, start thinking about how examples map to Aver operations. This preview feeds the next stage (`specified`).

| Example Part | Aver Operation |
|-------------|----------------|
| Given (precondition) | `act.*` -- setup actions |
| When (trigger) | `act.*` -- the action under test |
| Then (outcome) | `assert.*` or `query.*` + `expect` |

Do NOT finalize vocabulary names during mapping. That happens in the specification stage with human approval. Just note the rough shape.

## Anti-Patterns

- **Skipping rules, going straight to examples.** Rules structure the examples. Without them, you generate random scenarios instead of systematic coverage.
- **Resolving questions by guessing.** Questions exist precisely because the answer requires human judgment. Record and wait.
- **Writing code during the session.** Example Mapping produces English-language examples, not TypeScript.
- **Naming operations in implementation language.** "postToTaskEndpoint" is adapter detail. "createTask" is domain language.
- **Advancing without human confirmation.** The `mapped` stage means the human has confirmed intent. Never auto-advance.
