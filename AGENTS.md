# Aver — Agent Instructions

## Workflow

Always use the `aver:aver-workflow` skill for development work. This drives the scenario maturity pipeline (captured → characterized → mapped → specified → implemented) through MCP tools and phase-specific skill guides.

On session start:
1. Call `get_workflow_phase` to determine the current phase
2. Load the corresponding guide from the aver-workflow skill
3. Call `get_scenario_summary` to see scenario counts by stage

After completing backlog items or bug fixes, always commit separately per item, push to remote, and update the backlog tracking system before moving on.

## Build

Must build workspace THEN core before running CLI:
```
pnpm --filter @aver/workspace run build && pnpm --filter @aver/core run build
```

CLI entry: `node packages/core/dist/cli.js` (ESM)

## Testing

```
pnpm exec aver run
```

Expected failures: 7 Playwright tests (need browser).

- Always use `aver run` to execute tests, not `vitest run` directly.
- Always use `aver approve` to update approval baselines, not `AVER_APPROVE=1 vitest run`.
- Filter by adapter: `aver run --adapter unit`
- Filter by domain: `aver run --domain TaskBoard`
- Run specific file: `aver run tests/my-test.spec.ts`
- Build core before running MCP server or example tests: `pnpm build --filter aver`
- Only `*.approved.*` files are committed to git. `*.received.*` and `*.diff.*` are gitignored.

## Architecture

- `@aver/workspace` — scenario workspace engine (WorkspaceOps, BacklogOps, storage)
- `@aver/core` — domain-driven acceptance testing framework
- `@aver/mcp-server` — MCP server for workspace tools
- `@aver/eval` — LLM verdict scoring against rubrics
- `@aver/agent` — moved to [aver-experimental](https://github.com/njackson/aver-experimental)

## Package Manager

This project uses pnpm workspaces. Use `pnpm` for all package operations.

See per-package AGENTS.md files for package-specific instructions.

## Git

- GPG signing may fail in sandbox environments. If git commit fails due to GPG, retry with `dangerouslyDisableSandbox: true`.
- Adapter assertions should use vitest `expect` — not manual `if/throw`. Fix manual throws whenever encountered.

## Parallel Work / Subagents

- When dispatching parallel subagents, each agent must: (1) `cd` into its assigned worktree as the FIRST action, (2) run `pwd` to confirm location, (3) only then begin work. If an agent's changes aren't in its worktree, kill it and retry in a fresh worktree.
- After all agents complete, verify each worktree has the expected changes before merging. Merge one at a time, running the full test suite between merges. If any merge breaks tests, revert it and report.
- When running parallel subagent waves, always verify CI passes after merging results. Common issues: missing lockfiles, incorrect import path depths after file moves, and test timeout values being too low.

## Project Conventions

- Do not flag `AssertionMarker` as a typo — it is an intentional naming choice.

## Organization

### Plans and working documents

All plans, design docs, and working documents go in `.aver/` (gitignored — never committed).

```
.aver/
├── plans/          # Implementation plans, design docs, specs
│   ├── master-plan.md
│   ├── roadmap.md
│   └── YYYY-MM-DD-description.md
├── backlog.md      # Improvements, ideas, and DX issues to address later
└── runs/           # Test run snapshots (managed by MCP server)
```

- **Plans** (`.aver/plans/`): Detailed implementation plans, design documents, and specs. Name with date prefix: `YYYY-MM-DD-description.md`. These are working documents for development workflow, not committed.
- **Backlog** (`.aver/backlog.md`): Ideas, improvements, and issues that surface during development but aren't being worked on right now. Organized by category. When an item gets picked up, it becomes a plan.
- **`docs/plans/`**: Legacy location — do not add new files here. Gitignored going forward.

### When something surfaces during a conversation

If a conversation produces actionable improvements, framework ideas, or DX issues:
1. Add them to `.aver/backlog.md` under the appropriate category
2. Include enough context that future sessions can pick them up without re-deriving
3. Link to the plan file if one gets created
