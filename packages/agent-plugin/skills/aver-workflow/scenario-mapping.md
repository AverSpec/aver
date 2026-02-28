# Scenario Mapping (Example Mapping)

Structured conversation technique to extract rules, examples, and questions from a scenario. Based on Matt Wynne's Example Mapping. The core activity for advancing scenarios to `mapped`.

## When to Use

A scenario at `captured` (greenfield/intended) or `characterized` (legacy/observed) needs decomposition into testable pieces before domain vocabulary can be designed.

## The Four Cards

| Card | Color | What It Is |
|------|-------|------------|
| **Story** | Yellow | The scenario's behavior description |
| **Rule** | Blue | A business constraint or invariant |
| **Example** | Green | A concrete given/when/then proving a rule |
| **Question** | Red | An unresolved ambiguity |

## Session Flow

### 1. Present the scenario

Read the behavior description. If the scenario is `characterized`, review investigation evidence (approval baselines, seam analysis) first.

### 2. Extract rules

Derive rules from code evidence, approval baselines, and domain knowledge. Each rule is a **business constraint in domain language** — describe WHY the behavior matters, not WHERE it lives in code:
- "A task must have a title"
- "New tasks default to the 'todo' stage"
- "Task titles must be unique within a board"

Implementation details (which function validates, which table stores) belong in **seams**, not rules. Rules should read like something a product owner would say.

### 3. Generate examples per rule

At least two per rule — one satisfying, one violating. Each has three parts:
- **Given**: precondition / initial state
- **When**: the action taken
- **Then**: the expected outcome

### 4. Capture questions

Any ambiguity becomes a question, not a guess. Use `add_question` MCP tool to attach questions to the scenario. Do NOT resolve questions by fabricating answers.

### 5. Persist rules and examples on the scenario

Use `update_scenario` to save rules and examples directly on the scenario object. This is the durable record — not rationale text, not session notes.

```
Call update_scenario with:
  id: "<scenario ID>"
  rules: [
    "A task must have a title",
    "New tasks default to the 'todo' stage",
    "Task titles must be unique within a board"
  ]
  examples: [
    {
      description: "Empty title rejected",
      given: "No title provided",
      expectedOutcome: "Rejected with 'title is required'"
    },
    {
      description: "Valid task created with default stage",
      given: "Title 'Fix bug' with no stage specified",
      expectedOutcome: "Task exists in 'todo' stage"
    }
  ]
```

Rules are **business constraints in domain language** — what a product owner would say.
Examples read like **Example Mapping cards** with Given/When/Then in domain language.

### 6. Resolve or defer

Questions the human answers immediately: resolve with `resolve_question` and refine rules/examples. Questions needing more investigation: leave open. The scenario cannot advance until all questions are resolved.

## Confidence Reporting

For each proposed rule, indicate confidence:
- **Confirmed**: directly evident in code (explicit validation, schema constraint, test assertion)
- **Inferred**: pattern-based reasoning (naming conventions, similar modules, comments)
- **Speculative**: partial evidence, needs human verification

Present uncertain items first. Confirmed items can wait — the uncertain ones shape the conversation.

## Example Format

Rules and examples use **domain language**, not implementation details. Confidence annotations go on a separate line referencing evidence, not baked into the rule text.

```
Rule: A task must have a title
  Confidence: Confirmed (see approval baseline: create-task-validation.txt)
  Example: Given no title → create task → rejected with "title is required"
  Example: Given title "Fix bug" → create task → task exists with title "Fix bug"

Rule: New tasks default to the 'todo' stage
  Confidence: Inferred (all existing tasks start at 'todo', no explicit default found)
  Example: Given a title with no stage specified → create task → task is in 'todo'
  Example: Given a title with stage 'in-progress' → create task → task is in 'in-progress'
```

Notice: rules read like business constraints ("A task must have a title"), not code constraints ("Title validation in TaskService.create()"). Implementation locations belong in seams.

## When to Stop

- **More than 8 rules**: the scenario is too broad. Split into multiple scenarios.
- **More questions than examples**: not enough understanding. More investigation needed.
- **Rules that contradict**: two scenarios masquerading as one. Split.
- **Examples requiring multi-step setup across features**: the scenario crosses domain boundaries. Split by domain.

## Mapping Examples to Domain Operations (Preview)

During the session, start thinking about how examples map to Aver operations:

| Example Part | Aver Operation |
|-------------|----------------|
| Given (precondition) | `act.*` — setup actions |
| When (trigger) | `act.*` — the action under test |
| Then (outcome) | `assert.*` or `query.*` + `expect` |

Do NOT finalize vocabulary names during mapping. That happens in specification with human approval. Just note the rough shape.

## Advancement to `mapped`

Prerequisites:
1. Rules and examples saved on the scenario via `update_scenario`
2. All questions on the scenario are resolved
3. The human confirms the rules and examples reflect their intent

**ALWAYS confirm with the human before advancing to `mapped`.** Present rules, examples, and proposed scope. Wait for explicit approval.

## Anti-Patterns

- **Skipping rules, going straight to examples.** Rules structure the examples. Without them, you get random scenarios instead of systematic coverage.
- **Resolving questions by guessing.** Questions exist because the answer requires human judgment. Record and wait.
- **Writing code during mapping.** Example Mapping produces English-language examples, not TypeScript.
- **Naming operations in implementation language.** "postToTaskEndpoint" is adapter detail. "createTask" is domain language.
- **Batching too many proposals.** Present 1-3 items at a time. Prioritize uncertain items. Large batches cause rubber-stamping.
- **Advancing without human confirmation.** The `mapped` stage means the human has confirmed intent. Never auto-advance.

> **Human interaction:** Present rules and examples directly and wait for explicit confirmation before advancing. Use `add_question`/`resolve_question` MCP tools for async questions.
