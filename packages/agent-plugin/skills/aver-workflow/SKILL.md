---
name: aver-workflow
description: Scenario-driven acceptance testing — facilitates Example Mapping, Story Mapping, and domain design through collaborative sessions
---

# Aver Workflow

Aver is a domain-driven acceptance testing framework. This skill facilitates **collaborative sessions** between the agent and the human/team — Example Mapping, Story Mapping, investigation, and domain design. The agent's role is to ask questions, present evidence, propose rules and examples, and let the human confirm, refine, or reject.

## Backend Selection

Scripts live in `packages/agent-plugin/scripts/<backend>/` where `<backend>` is either `gh` (GitHub Issues) or `linear` (Linear). Check the `AVER_BACKEND` environment variable to determine which backend to use. Default to `gh` if unset.

- **`gh`** — GitHub Issues. Requires `gh` CLI authenticated. Good for open-source projects.
- **`linear`** — Linear. Requires `LINEAR_API_KEY` and `LINEAR_TEAM_ID` env vars. Good for teams and closed-source projects.

Both backends expose the **same script names with the same arguments and output format**. All script references in this skill use the path `packages/agent-plugin/scripts/<backend>/` — substitute the active backend.

## On Session Start

1. Determine the backend: check `AVER_BACKEND` env var (default: `gh`).
2. Run `packages/agent-plugin/scripts/<backend>/scenario-list.sh` to see all scenarios and their stages.
3. Count scenarios by stage to determine the current workflow phase (see Phase Detection below).
4. Load the corresponding guide from this directory based on the phase.
5. Run `packages/agent-plugin/scripts/<backend>/backlog-list.sh --status open` to see active backlog items.

## Three Session Types

The agent facilitates three types of collaborative session. Choose based on context:

### Discovery
Explore what exists, capture observations as scenarios. Use when investigating a legacy system or when behaviors are unknown.
- Read code, trace paths, capture approval baselines
- Each distinct behavior observed → `scenario-capture.sh --title "..." --body "..."`
- Feeds into Example Mapping once the human reviews findings
- Guide: `investigation.md`

### Example Mapping
Structured conversation for a single behavior: story → rules → examples → questions → scenarios. The core technique for advancing scenarios to `mapped`.
- Start from a backlog item or captured scenario
- Derive rules, generate examples, capture questions
- Human confirms before advancing
- Guide: `scenario-mapping.md`

### Story Mapping
Broader technique for slicing large features into scenarios. Map user activities → steps → details, then slice into stories that each become Example Mapping sessions.
- Use for large features, unclear scope, or when a backlog item covers many behaviors
- Each slice → `scenario-capture.sh --title "..."` → Example Mapping
- Guide: `story-mapping.md`

## Backlog → Scenario Bridge

Backlog items drive scenario creation. When a backlog item moves to `in-progress`:

1. **Assess scope**: Is this one behavior or many?
   - One behavior → start an Example Mapping session directly
   - Many behaviors → start a Story Mapping session to slice first
2. **Capture scenarios**: Each distinct behavior becomes a scenario via `scenario-capture.sh --title "..." --body "..."`
3. **Link**: Reference scenarios from the backlog item by adding issue links in comments or the backlog item body (e.g., `gh issue comment <backlog-number> --body "Scenarios: #1, #2, #3"`)
4. **Facilitate**: Run Example Mapping for each captured scenario

Ask the human:
> "This backlog item covers [X]. I see [N] distinct behaviors here. Should we map the whole thing first with Story Mapping, or dive into [specific behavior] with Example Mapping?"

## Scenario Pipeline

Scenarios move through five maturity stages. The human is a participant at every stage — the agent facilitates, never decides alone.

| Stage | Activity | Who Drives | Advances When |
|-------|----------|------------|---------------|
| **captured** | Record observed or intended behavior | Agent proposes, human reviews | Enough context to investigate or map |
| **characterized** | Investigate code, find seams, capture evidence | Agent investigates, presents findings to human | Evidence attached, human has reviewed findings |
| **mapped** | Example Mapping: rules, examples, questions | **Collaborative session** — agent proposes, human confirms/refines | All questions resolved, human confirms intent |
| **specified** | Name domain vocabulary, define adapter interfaces | Agent proposes names, **human approves vocabulary** | Human approves all names |
| **implemented** | TDD inner loop, adapter handlers, passing tests | Agent implements, human reviews | All tests pass, domain linked |

## Two Entry Paths

**Legacy path** (existing system, behavior unknown):
`captured` → `characterized` → `mapped` → `specified` → `implemented`

The agent investigates, characterizes behavior with approval tests, then facilitates mapping with the human. See `investigation.md`.

**Greenfield path** (new feature, intent known):
`captured` → `mapped` → `specified` → `implemented`

The human states intent directly. Skip characterization — go straight to Example Mapping. See `scenario-mapping.md`.

## Facilitation Mode

The agent's job is to **facilitate**, not decide:

- **Ask the right questions** — "What should happen when X?" not "X should do Y."
- **Present evidence** — approval baselines, code traces, existing tests
- **Propose rules and examples** — offer candidates for the human to confirm, refine, or reject
- **Capture uncertainty** — any ambiguity → `scenario-question.sh <number> --body "..."` immediately. Never guess.
- **Lead with what you don't know** — present uncertain items first. Confirmed items can wait.
- **Pause at checkpoints** — never advance a scenario without human confirmation

## Confidence on Rules

Three confidence levels affect how rules are handled:

| Level | Meaning | Action |
|-------|---------|--------|
| **Confirmed** | Directly evident — explicit validation, schema constraint, test | Present as proposed rule |
| **Inferred** | Pattern-based — naming conventions, similar modules | Present with caveat, ask for confirmation |
| **Speculative** | Partial evidence, could be wrong | Present as question. Auto-generate `scenario-question.sh <number> --body "..."` |

Speculative rules generate questions automatically. The scenario cannot advance until all questions (including speculative-rule questions) are resolved.

## Human Checkpoints

Stop and ask the human before proceeding when:

1. **Capturing scenarios** — "I see this behavior: [X]. Should I capture it as a scenario?"
2. **Confirming intent** — Never assume a captured behavior is desired. The human must confirm before advancing to `mapped`.
3. **Naming vocabulary** — Action, query, and assertion names become shared language. ALWAYS get human agreement before writing domain code.
4. **Ambiguous scope** — "This looks like it could be one scenario or two. How do you see it?"
5. **Conflicting scenarios** — "These two scenarios suggest contradictory behaviors. Which is correct?"
6. **Stage revisit** — "This test is failing because requirements changed. Should we revisit?"
7. **Three Amigos** — At each stage, ask: "Who else should weigh in on this? Does a product owner, tester, or developer need to review?"

## Delegation Rules

This skill facilitates the outer loop. It does NOT own:

| Concern | Delegate To |
|---------|-------------|
| Implementation (red/green/refactor) | `implementation.md` in this directory |
| Characterization testing | `characterization.md` in this directory |
| Code review and refactoring | Standard agent capabilities |

When a scenario reaches `specified`, load `implementation.md` for the ATDD double loop. When investigating legacy code, load `characterization.md` for locking existing behavior.

## Phase Detection

Run `scenario-list.sh` and count scenarios per stage to determine the current phase:

| Phase | Condition |
|-------|-----------|
| kickoff | No scenarios exist |
| investigation | Most scenarios at captured |
| mapping | Most scenarios at characterized or captured→mapped transition |
| specification | Most scenarios at mapped |
| implementation | Most scenarios at specified |
| verification | Most scenarios at implemented |
| discovery | Mix of stages, ongoing work |

## Structured Issue Body

Scenario content is stored in the GitHub Issue body using structured markdown. The skill constructs this body when creating/updating scenarios and parses the sections when reading.

```markdown
## Behavior
[description]

## Context
[context]

## Rules
- [rule 1]
- [rule 2]

## Examples
- [example 1]
- [example 2]

## Questions
- [ ] [open question]
- [x] [resolved question] → [resolution]

## Seams
- [seam 1]

## Domain Link
- Domain: [name]
- Operations: [list]
- Test: [path]
```

When updating a scenario, construct the full body and run `gh issue edit <number> --body "..."`. When reading, parse the sections from the issue body returned by `scenario-get.sh <number>`.

## Script Reference

All scripts are in `packages/agent-plugin/scripts/<backend>/` relative to the project root. Both `gh` and `linear` backends expose the same scripts with the same arguments.

### Setup

| Script | Purpose |
|--------|---------|
| `setup-labels.sh` | One-time setup of labels for stages, priorities, and types |

### Scenario Scripts

| Script | Purpose |
|--------|---------|
| `scenario-capture.sh --title "..." [--body "..."]` | Record an observed or intended behavior. Returns `{number, url}` |
| `scenario-list.sh [--stage X] [--search "..."]` | List scenarios, filter by stage or keyword. Returns JSON array |
| `scenario-get.sh <number>` | Get full issue JSON for a scenario |
| `scenario-advance.sh <number> --to <stage>` | Move a scenario to the next stage. Returns `{number, url, stage}` |
| `scenario-question.sh <number> --body "..."` | Attach an open question as a comment. Returns comment URL |
| `scenario-resolve.sh <number> --comment-id <id> --body "..."` | Resolve a question comment. Returns updated comment URL |

### Backlog Scripts

| Script | Purpose |
|--------|---------|
| `backlog-create.sh --title "..." [--priority P1] [--type feature] [--body "..."]` | Create a new backlog item. Returns `{number, url}` |
| `backlog-list.sh [--status open] [--priority P1] [--type feature]` | List backlog items with filters. Returns JSON array |
| `backlog-update.sh <number> [--add-label ...] [--remove-label ...] [--body "..."]` | Update labels or body of a backlog item. Returns URL |
| `backlog-close.sh <number>` | Close a backlog item. Returns URL |

### Additional Operations

| Operation | Command |
|-----------|---------|
| Update scenario body | **gh**: `gh issue edit <number> --body "..."` / **linear**: use `scenario-get.sh` then update via API |
| Confirm scenario (human gate) | Add a comment: `scenario-question.sh` pattern with "Confirmed by:" prefix |
| Run tests | `pnpm exec aver run` (filter with `--domain` or `--adapter`) |
| Inspect domain vocabulary | Read the domain source file directly |

## File References

| Guide | When to Use |
|-------|-------------|
| `investigation.md` | Discovery session — legacy characterization (characterized stage) |
| `scenario-mapping.md` | Example Mapping session (mapped stage) |
| `story-mapping.md` | Story Mapping session — slicing large features into scenarios |
| `specification.md` | Domain vocabulary and adapter interface design (specified stage) |
| `implementation.md` | Inner loop: ATDD double loop, TDD, refactoring (implemented stage) |
| `characterization.md` | Lock existing behavior before changes |

## Conventions

| Concept | Pattern | Example |
|---------|---------|---------|
| Domain variable | camelCase | `taskBoard` |
| Domain name field | kebab-case | `'task-board'` |
| Domain file | `domains/{kebab}.ts` | `domains/task-board.ts` |
| Adapter file | `adapters/{kebab}.{protocol}.ts` | `adapters/task-board.unit.ts` |
| Test file | `tests/{kebab}.spec.ts` | `tests/task-board.spec.ts` |
| Config file | `aver.config.ts` | root of test project |
