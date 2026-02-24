---
name: aver-workflow
description: Scenario-driven acceptance testing — facilitates Example Mapping, domain design, and adapter-first implementation
---

# Aver Workflow

Aver is a domain-driven acceptance testing framework. This skill owns the **outer loop** -- scenario tracking, dispatching work, and human checkpoints. It does NOT own implementation details like TDD, debugging, or code writing.

## On Session Start

1. Call `get_workflow_phase` to determine the current phase.
2. Load the corresponding guide from this directory based on the phase.
3. Call `get_scenario_summary` to see scenario counts by stage.

## Scenario Pipeline

Scenarios are behavioral examples that move through five maturity stages. Each stage has a clear owner and advancement trigger.

| Stage | Owner | Activity | Advances When |
|-------|-------|----------|---------------|
| **captured** | Agent | Record observed or intended behavior | Agent has enough context to investigate or map |
| **characterized** | Agent | Investigate code, find seams, capture approvals | Evidence attached, findings posted for human review |
| **mapped** | Human + Agent | Example Mapping session: rules, examples, questions | All questions resolved, human confirms intent |
| **specified** | Human + Agent | Name domain vocabulary, define adapter interfaces | Human approves vocabulary names |
| **implemented** | Agent (subagent) | TDD inner loop, adapter handlers, passing tests | All tests pass, domain linked |

## Two Entry Paths

**Legacy path** (existing system, behavior unknown):
`captured` -> `characterized` -> `mapped` -> `specified` -> `implemented`

The agent investigates autonomously, characterizes behavior with approval tests, then facilitates mapping with the human. See `investigation.md`.

**Greenfield path** (new feature, intent known):
`captured` -> `mapped` -> `specified` -> `implemented`

The human states intent directly. Skip characterization -- go straight to Example Mapping. See `scenario-mapping.md`.

## Human Checkpoints

Stop and ask the human before proceeding when:

1. **Naming vocabulary** -- Action, query, and assertion names become shared language. ALWAYS get human agreement before writing domain code.
2. **Confirming intent** -- Never assume a captured behavior is desired. The human must confirm before advancing to `mapped`.
3. **Ambiguous scope** -- When a scenario could map to multiple domains or the boundary is unclear.
4. **Conflicting scenarios** -- When two scenarios suggest contradictory behaviors.
5. **Stage revisit** -- When a test starts failing due to changed requirements, confirm before revisiting an earlier stage.

Checkpoints are **non-blocking** when possible. Post the question via `add_question`, continue working on independent scenarios, and return when the human responds.

## Delegation Rules

This skill orchestrates. It does NOT own:

| Concern | Delegate To |
|---------|-------------|
| TDD inner loop (red/green/refactor) | `tdd-loop.md` in this directory |
| Characterization testing | `characterization.md` in this directory |
| Code review and refactoring | Standard agent capabilities |

When a scenario reaches `specified`, load `tdd-loop.md` for the ATDD double loop. When investigating legacy code, load `characterization.md` for locking existing behavior.

## Subagent Dispatch Model

The outer loop stays thin. It reads scenario state, decides what work to dispatch, and posts checkpoint questions. It does not block on subagent completion.

**Dispatch pattern:**
1. Read scenario state via `get_scenarios` and `get_advance_candidates`
2. Identify independent scenarios (same stage, no dependencies on each other)
3. Dispatch background subagents for investigation or implementation
4. Post checkpoint questions for anything requiring human judgment
5. When subagents complete, review results and advance scenarios

**What the outer loop does:**
- Calls MCP tools to read/write scenario state
- Facilitates Example Mapping conversations
- Posts questions and processes answers
- Advances/revisits scenarios between stages
- Dispatches subagents for heavy work

**What the outer loop does NOT do:**
- Write application code
- Write test code
- Debug failures
- Run the TDD cycle

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
| `export_scenarios` | Export as markdown or JSON |
| `import_scenarios` | Import from JSON |

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
| `investigation.md` | Legacy characterization path (characterized stage) |
| `scenario-mapping.md` | Facilitating an Example Mapping session (mapped stage) |
| `specification.md` | Domain vocabulary and adapter interface design (specified stage) |
| `tdd-loop.md` | Inner loop: ATDD double loop, TDD, refactoring (implemented stage) |
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
