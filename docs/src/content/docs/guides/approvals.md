---
title: "Approval Testing"
---

# Approval Testing

## Overview

`@averspec/approvals` provides two approval modes:

- **`approve(value)`** — structural approval (text/JSON diff)
- **`approve.visual('name')`** — visual approval (screenshot + pixel diff)

Both use the same workflow: baseline → compare → diff → approve.

```ts
import { approve } from '@averspec/approvals'

// Structural: approve a data value
await approve(taskList, { name: 'tasks' })

// Visual: approve what the screen looks like
await approve.visual('board-with-task')
```

> `approve` is also exported as `characterize` — same function, alternative name for characterization test contexts: `import { characterize } from '@averspec/approvals'`

## `characterize()` vs `approve()`

`characterize()` and `approve()` are the same function — they behave identically at runtime. The distinction is purely about communicating intent to future readers of your test code. Use `characterize()` during discovery: "I don't know if this output is correct yet, but I'm locking it in as a baseline so I'll notice if it changes." Use `approve()` in steady state: "I have reviewed this output and confirmed it is the desired behavior." As your understanding of the system solidifies, you can rename `characterize()` calls to `approve()` to signal that the baseline has been deliberately validated.

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
import { playwright } from '@averspec/protocol-playwright'

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

On protocols without a screenshotter (unit, http), `approve.visual()` throws an error. Only use it with visual protocols like Playwright.

## Visual Diff Demo (Playwright)

From the example app:

```bash
cd examples/task-board
```

### 1) Create the initial baseline

```bash
AVER_DEMO_APPROVAL=1 pnpm aver approve --adapter playwright tests/task-board.spec.ts
```

This writes:
- `tests/__approvals__/visual-approval-of-task-board/board-with-task.approved.png`

### 2) Run again to verify it matches

```bash
AVER_DEMO_APPROVAL=1 pnpm aver run --adapter playwright tests/task-board.spec.ts
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
