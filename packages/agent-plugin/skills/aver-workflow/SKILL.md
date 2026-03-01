---
name: aver-workflow
description: Scenario-driven acceptance testing — facilitates Example Mapping, Story Mapping, and domain design through collaborative sessions
---

# Aver Workflow

Aver is a domain-driven acceptance testing framework. This skill facilitates **collaborative sessions** between the agent and the human/team — Example Mapping, Story Mapping, investigation, and domain design. The agent's role is to ask questions, present evidence, propose rules and examples, and let the human confirm, refine, or reject.

## On Session Start

1. Call `get_workflow_phase` to determine the current phase.
2. Load the corresponding guide from this directory based on the phase.
3. Call `get_scenario_summary` to see scenario counts by stage.
4. Call `get_backlog_items` (status: `in-progress`) to see what's actively being worked.

## Three Session Types

The agent facilitates three types of collaborative session. Choose based on context:

### Discovery
Explore what exists, capture observations as scenarios. Use when investigating a legacy system or when behaviors are unknown.
- Read code, trace paths, capture approval baselines
- Each distinct behavior observed → `capture_scenario` (mode: `observed`)
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
- Each slice → `capture_scenario` → Example Mapping
- Guide: `story-mapping.md`

## Backlog → Scenario Bridge

Backlog items drive scenario creation. When a backlog item moves to `in-progress`:

1. **Assess scope**: Is this one behavior or many?
   - One behavior → start an Example Mapping session directly
   - Many behaviors → start a Story Mapping session to slice first
2. **Capture scenarios**: Each distinct behavior becomes a scenario via `capture_scenario`
3. **Link**: Use `update_backlog_item` with `scenarioIds` to connect scenarios back to the backlog item
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
- **Capture uncertainty** — any ambiguity → `add_question` immediately. Never guess.
- **Lead with what you don't know** — present uncertain items first. Confirmed items can wait.
- **Pause at checkpoints** — never advance a scenario without human confirmation

## Confidence on Rules

Three confidence levels affect how rules are handled:

| Level | Meaning | Action |
|-------|---------|--------|
| **Confirmed** | Directly evident — explicit validation, schema constraint, test | Present as proposed rule |
| **Inferred** | Pattern-based — naming conventions, similar modules | Present with caveat, ask for confirmation |
| **Speculative** | Partial evidence, could be wrong | Present as question. Auto-generate `add_question` |

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

## MCP Tool Reference

### Scenario Tools

| Tool | Purpose |
|------|---------|
| `capture_scenario` | Record an observed or intended behavior |
| `get_scenarios` | List scenarios, filter by stage/story/keyword |
| `get_scenario_summary` | Counts per stage, open questions |
| `advance_scenario` | Move a scenario to the next stage |
| `revisit_scenario` | Move a scenario back to an earlier stage |
| `get_advance_candidates` | Scenarios eligible for advancement |
| `add_question` | Attach an open question to a scenario |
| `resolve_question` | Mark a question as answered |
| `link_to_domain` | Connect a scenario to domain operations and tests |
| `update_scenario` | Update scenario fields (rules, examples, seams, constraints, behavior, context, story) |
| `confirm_scenario` | Human-only gate — sets confirmedBy required before characterized → mapped |
| `delete_scenario` | Remove a scenario from the workspace |
| `export_scenarios` | Export as markdown or JSON |
| `import_scenarios` | Import from JSON |

### Backlog Tools

| Tool | Purpose |
|------|---------|
| `create_backlog_item` | Create a new backlog item |
| `update_backlog_item` | Update status, priority, description, etc. |
| `delete_backlog_item` | Remove a backlog item |
| `get_backlog_items` | List items with filters (status, priority, type) |
| `get_backlog_summary` | Counts by status and priority |
| `move_backlog_item` | Reorder or reprioritize |

### Domain Tools

| Tool | Purpose |
|------|---------|
| `list_domains` | All registered domains |
| `get_domain_vocabulary` | Actions, queries, assertions for a domain |
| `list_adapters` | Which protocols are implemented |
| `describe_domain_structure` | Generate a CRUD domain template |
| `describe_adapter_structure` | Handler signatures for a domain + protocol |
| `get_project_context` | File paths and naming conventions |

### Testing Tools

| Tool | Purpose |
|------|---------|
| `run_tests` | Run the test suite (filter by domain or adapter) |
| `get_failure_details` | Inspect failures with error messages and traces |
| `get_test_trace` | Execution trace for a specific test |
| `get_run_diff` | Compare last two runs |

### Phase

| Tool | Purpose |
|------|---------|
| `get_workflow_phase` | Detect current phase from scenario state |

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
