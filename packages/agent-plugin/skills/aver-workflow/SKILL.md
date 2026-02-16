---
name: aver-workflow
description: Maturity pipeline workflow for domain-driven acceptance testing. Guides behaviors from observation through formalized tests.
---

# Aver Workflow

Aver is a domain-driven acceptance testing framework. This skill orchestrates the **maturity pipeline** -- a progression that turns observed system behaviors into formalized, executable acceptance tests.

## First Step: Determine the Workflow Phase

On session start, call `get_workflow_phase` to determine where the project stands. The response tells you which phase is active and what to do next. Then load the corresponding phase guide from `phases/`.

## The Maturity Pipeline

Behaviors progress through four phases of increasing confidence:

| Phase | State | Key Activity | Output |
|-------|-------|-------------|--------|
| **Observed** | Raw notes, hunches, things noticed | Record observations | Workspace items |
| **Explored** | Investigated, understood, with context | Ask questions, investigate code | Questions + answers |
| **Intended** | Confirmed as desired behavior | State intent, get human confirmation | Intent statements |
| **Formalized** | Executable acceptance test | Define domain, write test, implement adapter | Passing tests |

Each phase has a dedicated guide:
- `phases/observed.md` -- Recording and triaging observations
- `phases/explored.md` -- Investigating and asking questions
- `phases/intended.md` -- Confirming intent with stakeholders
- `phases/formalized.md` -- Writing domains, tests, and adapters (the TDD inner loop)

## Three Amigos Perspectives

Adopt different perspectives depending on what the work requires. Each perspective has a dedicated guide in `perspectives/`.

**Business** -- What should the system do?
- Confirms behaviors as intentional
- Owns promotions from observed to explored to intended
- Speaks in domain language, not implementation details
- Guide: `perspectives/business.md`

**Development** -- How does the system work?
- Investigates seams, constraints, and architecture
- Explores code to understand what exists
- Identifies where new behavior fits
- Guide: `perspectives/development.md`

**Testing** -- How do we verify it?
- Writes examples and maps them to domain operations
- Creates tests using the Aver framework
- Owns promotions from intended to formalized
- Guide: `perspectives/testing.md`

## MCP Tools

### Workspace Tools (maturity pipeline)

| Tool | Purpose |
|------|---------|
| `get_workflow_phase` | Determine current phase and next steps |
| `get_workspace_summary` | Overview of all workspace items by phase |
| `get_workspace_items` | List items, optionally filtered by phase |
| `record_observation` | Record something noticed about the system |
| `record_intent` | Record a confirmed behavioral intent |
| `promote_item` | Move an item to the next maturity phase |
| `demote_item` | Move an item back to a previous phase |
| `add_question` | Attach a question to a workspace item |
| `resolve_question` | Mark a question as answered |
| `link_to_domain` | Connect a workspace item to an Aver domain |
| `get_promotion_candidates` | Find items ready to advance |
| `export_workspace` | Export workspace as portable JSON |
| `import_workspace` | Import workspace from JSON |

### Domain & Testing Tools (formalized phase)

| Tool | Purpose |
|------|---------|
| `list_domains` | See all registered Aver domains |
| `get_domain_vocabulary` | See actions, queries, assertions for a domain |
| `list_adapters` | See which protocols are implemented |
| `describe_domain_structure` | Generate a CRUD domain template |
| `describe_adapter_structure` | Show handler structure for a domain + protocol |
| `get_project_context` | Discover file paths and naming conventions |
| `run_tests` | Run the test suite (filter by domain or adapter) |
| `get_failure_details` | Inspect failures with error messages and traces |
| `get_test_trace` | Get the execution trace for a specific test |
| `get_run_diff` | Compare last two runs -- newly passing, newly failing |

## Human Feedback Triggers

Pause and ask the human before proceeding when:

1. **Promoting to intended** -- The human must confirm that an explored behavior is actually desired. Never assume intent.
2. **Naming domain vocabulary** -- Action, query, and assertion names become the shared language. Get human agreement on names.
3. **Ambiguous scope** -- When an observation could map to multiple domains or the boundary is unclear.
4. **Conflicting observations** -- When two observations suggest contradictory behaviors.
5. **Phase regression** -- When a formalized test starts failing due to changed requirements, confirm before demoting.

## Pattern References

Detailed technique guides live in `patterns/`:
- `patterns/legacy-characterization.md` -- Wrapping existing systems with observation-first tests
- `patterns/example-mapping.md` -- Structured discovery of rules, examples, and questions
- `patterns/tdd-inner-loop.md` -- The define-test-implement cycle within the formalized phase
- `patterns/agent-coordination.md` -- Multi-agent team workflows with shared workspaces

## Walkthrough Examples

Complete worked examples live in `examples/`:
- `examples/task-board.md` -- Adding a feature to the task-board example app

## Quick Reference: The Formalization Cycle

When you reach the formalized phase, follow this inner loop:

1. **Define** -- Add `action()`, `query()`, or `assertion()` markers to the domain
2. **Test** -- Write the test using domain vocabulary (never adapter details)
3. **Implement** -- Add handlers to each adapter (TypeScript flags missing ones)
4. **Verify** -- Run tests with `run_tests`, check results with `get_run_diff`

See `patterns/tdd-inner-loop.md` and `patterns.md` for complete code examples.

## Conventions

| Concept | Pattern | Example |
|---------|---------|---------|
| Domain variable | camelCase | `taskBoard` |
| Domain name field | kebab-case | `'task-board'` |
| Domain file | `domains/{kebab}.ts` | `domains/task-board.ts` |
| Adapter file | `adapters/{kebab}.{protocol}.ts` | `adapters/task-board.unit.ts` |
| Test file | `tests/{kebab}.spec.ts` | `tests/task-board.spec.ts` |
| Config file | `aver.config.ts` | root of test project |
