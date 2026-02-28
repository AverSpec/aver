# Aver Project

## Workflow

Always use the `aver:aver-workflow` skill for development work. This drives the scenario maturity pipeline (captured → characterized → mapped → specified → implemented) through MCP tools and phase-specific skill guides.

On session start:
1. Call `get_workflow_phase` to determine the current phase
2. Load the corresponding guide from the aver-workflow skill
3. Call `get_scenario_summary` to see scenario counts by stage

## Build

Must build agent THEN core before running CLI:
```
pnpm --filter @aver/agent run build && pnpm --filter @aver/core run build
```

CLI entry: `node packages/core/dist/cli.js` (ESM)

## Test

```
pnpm exec vitest run
```

Expected failures: 5 eval/judge tests (need Claude Code auth), 7 Playwright tests (need browser).
