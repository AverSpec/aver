# Aver — Agent Instructions

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

## Testing

- Always use `aver run` to execute tests, not `vitest run` directly.
- Always use `aver approve` to update approval baselines, not `AVER_APPROVE=1 vitest run`.
- Filter by adapter: `aver run --adapter unit`
- Filter by domain: `aver run --domain TaskBoard`
- Run specific file: `aver run tests/my-test.spec.ts`
- Build core before running MCP server or example tests: `pnpm build --filter aver`

## Approval Testing

- Only `*.approved.*` files are committed to git. `*.received.*` and `*.diff.*` are gitignored.
- On mismatch, the test fails and generates diff artifacts. Run `aver approve` to update the baseline.

## Package Manager

- This project uses pnpm workspaces. Use `pnpm` for all package operations.

## Monorepo

- See per-package AGENTS.md files for package-specific instructions.
