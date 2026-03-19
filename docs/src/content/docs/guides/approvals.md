---
title: "Approval Testing"
---

## Overview

`@averspec/approvals` provides two ways to lock in behavior as a baseline:

**`approve(value)`** — Serializes a value (object, string, array) to text and compares it against a stored `.approved.txt` file. On first run there's no baseline, so the test fails. You review the output, approve it, and future runs diff against that baseline. Any structural change to the output fails the test until you explicitly approve the new version. Good for API responses, computed results, configuration snapshots — anything you can serialize.

**`approve.visual('name')`** — Takes a screenshot via the protocol's screenshotter (e.g., Playwright) and compares it pixel-by-pixel against a stored `.approved.png`. Same workflow: first run captures, subsequent runs diff. Produces a visual diff image highlighting changed pixels. Good for UI regressions — layout shifts, missing elements, style changes.

Both follow the same cycle: baseline → compare → diff → approve.

```ts
import { approve } from '@averspec/approvals'

// Structural: serialize and diff a data value
await approve(taskList, { name: 'tasks' })

// Visual: screenshot and pixel-diff the current screen
await approve.visual('board-with-task')
```

## `characterize()` vs `approve()`

`characterize()` and `approve()` are the same function — `import { characterize } from '@averspec/approvals'`. The difference is intent. Use `characterize()` when you're locking in behavior you haven't fully validated yet: "I don't know if this output is correct, but I want to know if it changes." Use `approve()` when you've reviewed the baseline and confirmed it's the desired behavior.

One workflow that can emerge from this: start with `characterize()` on legacy code, and as you gain understanding, rename calls to `approve()` to mark that the baseline has been deliberately validated. Whether your team adopts that convention depends on how much you value the signal in your test code — it's there if you want it.

## Workflow

1. First run: test fails with "Baseline missing"
2. Run `npx aver approve` to create the baseline
3. Subsequent runs: auto-compare against baseline
4. On mismatch: diff files generated, test fails
5. Run `npx aver approve` again to update the baseline

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
