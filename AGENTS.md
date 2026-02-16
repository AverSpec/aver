# Aver — Agent Instructions

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
