# @aver/workspace

Scenario workspace for [Aver](../../README.md) — maturity pipeline state management for BDD workflows.

## Install

```bash
npm install @aver/workspace
```

## Usage

```typescript
import { WorkspaceStore, WorkspaceOps } from '@aver/workspace'

// Create a workspace backed by a JSON file
const store = WorkspaceStore.withDefaults('my-project')
const ops = new WorkspaceOps(store)

// Record an observed behavior
const item = ops.recordObservation({
  behavior: 'Users can add items to their cart',
  context: 'Observed during checkout flow walkthrough',
})

// Promote through maturity stages: observed -> explored -> intended -> formalized
ops.promoteItem(item.id, {
  rationale: 'Confirmed with product owner',
  promotedBy: 'team',
})

// Record an intended behavior directly
ops.recordIntent({
  behavior: 'Cart total updates when items are removed',
  story: 'shopping-cart',
})

// Query and filter items
const intended = ops.getItems({ stage: 'intended' })
const summary = ops.getSummary()
```

The package also exports `detectPhase()` for workflow phase detection, and `exportMarkdown()`/`exportJson()`/`importJson()` for workspace portability.

## License

[MIT](../../LICENSE)
