# Approval Testing

## Overview

`@aver/approvals` provides two approval modes:

- **`approve(value)`** — structural approval (text/JSON diff)
- **`approve.visual('name')`** — visual approval (screenshot + pixel diff)

Both use the same workflow: baseline → compare → diff → approve.

```ts
import { approve } from '@aver/approvals'

// Structural: approve a data value
await approve(taskList, { name: 'tasks' })

// Visual: approve what the screen looks like
await approve.visual('board-with-task')
```

## Workflow

1. First run: test fails with "Baseline missing"
2. Run with `AVER_APPROVE=1` to create the baseline
3. Subsequent runs: auto-compare against baseline
4. On mismatch: diff files generated, test fails
5. Run with `AVER_APPROVE=1` again to update the baseline

## Visual Approvals

Visual approvals use the `screenshotter` protocol extension. Protocols that can take screenshots (e.g., Playwright) provide this automatically.

### Setup

```ts
import { playwright } from '@aver/protocol-playwright'

const proto = playwright({
  regions: {
    'board': '.board',
    'backlog': '[data-testid="column-backlog"]',
  },
})
```

### Usage

```ts
// Full page screenshot
await approve.visual('board-state')

// Scoped to a named region
await approve.visual({ name: 'backlog', region: 'backlog' })
```

On protocols without a screenshotter (unit, http), `approve.visual()` logs a warning and skips.

## Visual Diff Demo (Playwright)

From the example app:

```bash
cd examples/task-board
```

### 1) Create the initial baseline

```bash
AVER_DEMO_APPROVAL=1 AVER_APPROVE=1 AVER_ADAPTER=playwright pnpm vitest run tests/task-board.spec.ts
```

This writes:
- `tests/__approvals__/visual-approval-of-task-board/board-with-task.approved.png`

### 2) Run again to verify it matches

```bash
AVER_DEMO_APPROVAL=1 AVER_ADAPTER=playwright pnpm vitest run tests/task-board.spec.ts
```

### Files

Approval artifacts live in `tests/__approvals__/<test-name>/`:

```
board-with-task.approved.png   ← committed (baseline)
board-with-task.received.png   ← gitignored (transient)
board-with-task.diff.png       ← gitignored (transient)
```

### Recommended .gitignore

```
**/__approvals__/**/*.received.*
**/__approvals__/**/*.diff.*
```
