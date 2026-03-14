# Aver — Agent Instructions

## Workflow

Always use the `aver:aver-workflow` skill for development work. This drives the scenario maturity pipeline (captured → characterized → mapped → specified → implemented) through GitHub Issues and phase-specific skill guides.

On session start:
1. Run `packages/agent-plugin/scripts/gh/scenario-list.sh` to see scenarios and their stages
2. Count scenarios by stage to determine the current workflow phase
3. Load the corresponding guide from the aver-workflow skill
4. Run `packages/agent-plugin/scripts/gh/backlog-list.sh --status open` to see active backlog items

After completing backlog items or bug fixes, always commit separately per item, push to remote, and update the backlog tracking system before moving on.

## Build

```
pnpm --filter @averspec/core run build
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
- Only `*.approved.*` files are committed to git. `*.received.*` and `*.diff.*` are gitignored.

## Architecture

- `@averspec/core` — domain-driven acceptance testing framework
- `@averspec/approvals` — approval testing (structural diffs, visual screenshots)
- `@averspec/telemetry` — dev-to-prod telemetry verification
- `@averspec/protocol-http` — HTTP protocol adapter
- `@averspec/protocol-playwright` — Playwright browser protocol adapter
- `@averspec/agent-plugin` — Claude Code plugin (workflow skills + GitHub Issues scripts)
- `@averspec/agent` — moved to [aver-experimental](https://github.com/averspec/aver-experimental)

## Package Manager

This project uses pnpm workspaces. Use `pnpm` for all package operations.

See per-package AGENTS.md files for package-specific instructions.

## Git

- GPG signing may fail in sandbox environments. If git commit fails due to GPG, retry with `dangerouslyDisableSandbox: true`.
- Adapter assertions should use vitest `expect` — not manual `if/throw`. Fix manual throws whenever encountered.

## Parallel Work / Subagents

### Subagent responsibilities

Each worktree agent is responsible for:

1. **Working in isolation** — use `isolation: "worktree"` on the Agent tool. The agent gets its own copy of the repo automatically.
2. **Committing its own work** — commit with `dangerouslyDisableSandbox: true` (GPG signing). Use a descriptive message referencing the ticket ID, e.g., `fix: metadataFor uses protocol name (AI-76)`.
3. **Running tests** — verify changes pass before committing. Expected Playwright failures (no browser) are acceptable.
4. **Advancing ticket status** — move the assigned Linear ticket to Done via the API using `dangerouslyDisableSandbox: true`:
   ```bash
   # Query issue ID and Done state ID, then update
   curl -s -H "Authorization: $(cat ~/.config/aver/.env | grep LINEAR_API_KEY | cut -d= -f2)" \
     -H "Content-Type: application/json" \
     -d '{"query":"..."}' https://api.linear.app/graphql
   ```

### Orchestrator responsibilities

The orchestrator (main session) handles:

1. **Dispatching** — launch agents in parallel with `isolation: "worktree"`, providing full context (ticket description, relevant file contents, specific instructions).
2. **Merging** — merge each agent's worktree branch to main one at a time, smallest/least-conflicting first.
3. **Verifying** — run the full test suite between merges. If a merge breaks tests, revert and investigate.
4. **Cleanup** — worktrees with no changes are auto-cleaned. Worktrees with changes persist until merged.

### Prompt template for subagents

Include in every subagent prompt:
- The ticket ID and full description
- Contents of relevant source files (don't make the agent search)
- Explicit test command: `pnpm exec aver run` (or `npx vitest run` if CLI not built)
- Reminder: `dangerouslyDisableSandbox: true` for git and curl commands
- Reminder: do not reference panelist names in ticket updates

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
└── backlog.md      # Improvements, ideas, and DX issues to address later
```

- **Plans** (`.aver/plans/`): Detailed implementation plans, design documents, and specs. Name with date prefix: `YYYY-MM-DD-description.md`. These are working documents for development workflow, not committed.
- **Backlog** (`.aver/backlog.md`): Ideas, improvements, and issues that surface during development but aren't being worked on right now. Organized by category. When an item gets picked up, it becomes a plan.
- **`docs/plans/`**: Legacy location — do not add new files here. Gitignored going forward.

### When something surfaces during a conversation

If a conversation produces actionable improvements, framework ideas, or DX issues:
1. Add them to `.aver/backlog.md` under the appropriate category
2. Include enough context that future sessions can pick them up without re-deriving
3. Link to the plan file if one gets created
