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

// Capture an observed behavior (legacy characterization)
const scenario = ops.captureScenario({
  behavior: 'Users can add items to their cart',
  context: 'Observed during checkout flow walkthrough',
})

// Advance through maturity stages: captured -> characterized -> mapped -> specified -> implemented
ops.advanceScenario(scenario.id, {
  rationale: 'Confirmed with product owner',
  promotedBy: 'team',
})

// Capture an intended behavior (greenfield)
ops.captureScenario({
  behavior: 'Cart total updates when items are removed',
  story: 'shopping-cart',
  mode: 'intended',
})

// Query and filter scenarios
const mapped = ops.getScenarios({ stage: 'mapped' })
const summary = ops.getScenarioSummary()
```

The package also exports `detectPhase()` for workflow phase detection, and `exportMarkdown()`/`exportJson()`/`importJson()` for workspace portability.

## License

[MIT](../../LICENSE)
