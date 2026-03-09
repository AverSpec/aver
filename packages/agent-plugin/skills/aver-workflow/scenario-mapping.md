# Example Mapping (Facilitated Session)

Structured collaborative technique to extract rules, examples, and questions from a scenario. Based on Matt Wynne's Example Mapping. The agent facilitates — the human/team confirms, refines, and decides.

## When to Use

A scenario at `captured` (greenfield/intended) or `characterized` (legacy/observed) needs decomposition into testable pieces before domain vocabulary can be designed. This is the core activity for advancing scenarios to `mapped`.

## The Four Cards

| Card | Color | What It Is |
|------|-------|------------|
| **Story** | Yellow | The scenario's behavior description |
| **Rule** | Blue | A business constraint or invariant |
| **Example** | Green | A concrete given/when/then proving a rule |
| **Question** | Red | An unresolved ambiguity |

## Facilitation Flow

### 1. Open the Session

Present the story and set context. If the scenario is `characterized`, review evidence first.

Say to the human:
> "Let's map out **[scenario behavior]**. Here's what we know so far:
> - [summary of evidence / context / approval baselines]
> - [known constraints]
>
> Who else should weigh in on this? (Three Amigos: product owner, tester, developer)"

Wait for the human to confirm participants and context before proceeding.

### 2. Elicit Rules — Lead with Uncertainty

Propose candidate rules. **Present uncertain items first** — they shape the conversation more than confirmed ones.

For each proposed rule, state confidence:

Say to the human:
> "I see these candidate rules. I'm leading with the ones I'm least sure about:
>
> **Speculative** (needs your input):
> - [rule] — I'm guessing based on [evidence]. Is this right?
>
> **Inferred** (pattern-based):
> - [rule] — I see this pattern in [evidence]. Does it match your understanding?
>
> **Confirmed** (directly evident):
> - [rule] — This is explicit in [code/test/schema]."

**Speculative rules generate questions automatically.** For each speculative rule, immediately run `packages/agent-plugin/scripts/gh/scenario-question.sh <number> --body "..."` with the uncertainty. Don't wait.

Present 1-3 rules at a time. Large batches cause rubber-stamping. Ask:
> "Do these match your understanding? Anything missing? Anything wrong?"

### 3. Generate Examples Together

For each confirmed rule, propose a concrete example. Then ask for counter-examples and edge cases.

Say to the human:
> "For the rule **[rule text]**, here's an example:
>
> **Given**: [precondition]
> **When**: [action]
> **Then**: [expected outcome]
>
> Can you think of an edge case or a situation where this rule gets tricky?"

Generate at least two examples per rule — one satisfying, one violating. The human may suggest examples the agent wouldn't think of.

### 4. Capture Questions Immediately

Any ambiguity becomes a question, not a guess. Run `packages/agent-plugin/scripts/gh/scenario-question.sh <number> --body "..."` the moment uncertainty surfaces.

Say to the human:
> "I'm not sure about [X]. I've captured it as a question on the scenario. We can't advance until it's resolved — but we can keep mapping other rules in the meantime."

Do NOT resolve questions by fabricating answers. Questions exist because the answer requires human judgment.

### 5. Check Scope

After rules and examples are drafted, check whether the scenario should be split.

Say to the human:
> "We have [N] rules and [M] examples. Let me check scope:
> - More than 8 rules? → probably too broad, should split
> - More questions than examples? → need more investigation first
> - Rules that contradict? → two scenarios masquerading as one
>
> Is this one scenario or should we split it?"

Splitting signals:
- **More than 8 rules**: the scenario is too broad
- **More questions than examples**: not enough understanding
- **Rules that contradict**: two scenarios masquerading as one
- **Examples requiring multi-step setup across features**: crosses domain boundaries

### 6. Persist Rules and Examples

Update the GitHub Issue body via `gh issue edit <number> --body "..."` to save rules and examples directly on the scenario issue.

```
Edit the issue body to include:

## Rules
- A task must have a title
- New tasks default to the 'todo' stage
- Task titles must be unique within a board

## Examples
- **Empty title rejected** — Given: No title provided → Rejected with 'title is required'
- **Valid task created with default stage** — Given: Title 'Fix bug' with no stage specified → Task exists in 'todo' stage
```

Rules are **business constraints in domain language** — what a product owner would say.
Examples read like **Example Mapping cards** with Given/When/Then in domain language.

### 7. Confidence Check and Advancement

Present a summary with confidence levels before asking to advance.

Say to the human:
> "Here's where we landed on **[scenario behavior]**:
>
> **Rules** ([N] total):
> - [Confirmed] [rule]
> - [Inferred] [rule] — I think this is right based on [evidence]
>
> **Examples** ([M] total):
> - [example summaries]
>
> **Open Questions** ([Q] total):
> - [question list, if any]
>
> Are you confident enough to move to domain design, or do we need more investigation?"

Prerequisites for advancement to `mapped`:
1. Rules and examples saved in the scenario issue body via `gh issue edit`
2. All questions on the scenario are resolved
3. The human confirms the rules and examples reflect their intent

**ALWAYS confirm with the human before advancing.** Never auto-advance.

## Mapping Examples to Domain Operations (Preview)

During the session, start thinking about how examples map to Aver operations:

| Example Part | Aver Operation |
|-------------|----------------|
| Given (precondition) | `act.*` — setup actions |
| When (trigger) | `act.*` — the action under test |
| Then (outcome) | `assert.*` or `query.*` + `expect` |

Do NOT finalize vocabulary names during mapping. That happens in specification with human approval. Just note the rough shape.

## Anti-Patterns

- **Skipping rules, going straight to examples.** Rules structure the examples. Without them, you get random scenarios instead of systematic coverage.
- **Resolving questions by guessing.** Questions exist because the answer requires human judgment. Record and wait.
- **Writing code during mapping.** Example Mapping produces English-language examples, not TypeScript.
- **Naming operations in implementation language.** "postToTaskEndpoint" is adapter detail. "createTask" is domain language.
- **Batching too many proposals.** Present 1-3 items at a time. Prioritize uncertain items. Large batches cause rubber-stamping.
- **Advancing without human confirmation.** The `mapped` stage means the human has confirmed intent. Never auto-advance.
- **Deciding for the human.** The agent proposes, the human disposes. Present options, not conclusions.
