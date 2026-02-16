# Pattern: Legacy Characterization

Wrapping existing systems with observation-first tests using seam finding (Feathers), characterization testing (Bache), and approval-first workflows.

## When to Use This Pattern

You are working with an existing codebase that has behaviors you need to preserve but no tests to verify them. Before making changes, you need a safety net that captures what the system actually does -- not what you think it does.

This pattern applies during the **discovery** and **formalization** phases, and uses the `@aver/approvals` package to lock down existing behavior before modifying it.

## Step 1: Identify Seams

A seam (per Michael Feathers, _Working Effectively with Legacy Code_) is a place where you can observe or intercept behavior without modifying the source code. Seams are where your tests will attach.

**Common seam types:**

| Seam Type | What to Look For | Example |
|-----------|------------------|---------|
| Function boundary | Exported functions with clear inputs/outputs | `calculateTotal(items)` returns a number |
| Constructor injection | Dependencies passed in rather than hard-coded | `new OrderService(repository, mailer)` |
| Configuration point | Behavior controlled by external config | `process.env.FEATURE_FLAG` toggles a code path |
| Middleware/hooks | Interception points in a pipeline | Express middleware, event listeners |
| API boundary | HTTP endpoints with request/response contracts | `GET /api/orders/:id` returns JSON |
| Rendering output | UI components producing deterministic HTML/pixels | A dashboard page at a known URL |

**How to find seams in practice:**

1. Start from the behavior you observed. Trace the code path from entry point to effect.
2. At each function call boundary, ask: "Can I call this in isolation with controlled inputs?"
3. Mark boundaries where the answer is yes. These are your seams.
4. If no clean seams exist, look one level out -- can you intercept at the caller instead?

Record seams in your promotion rationale when promoting observed items to explored:

```
Call promote_item with:
  id: "<item ID>"
  rationale: "Order total calculation flows through OrderService.calculateTotal()
    which sums line items and applies discounts. Seam: OrderService constructor
    accepts a DiscountProvider interface. Can stub discounts for deterministic
    testing. Second seam: the /api/orders/:id endpoint returns the full order
    including total -- can test through HTTP without touching internals."
  promotedBy: "development"
```

## Step 2: Capture Current Behavior with Approvals

Characterization testing (per Emily Bache) means writing tests that document what the system currently does, not what it should do. The `approve()` function from `@aver/approvals` is the primary tool.

### Structural approvals (text and JSON)

Use structural approvals when the behavior produces data -- API responses, computed values, formatted output:

```typescript
import { approve } from '@aver/approvals'

test('order total calculation', async ({ act, query }) => {
  await act.createOrder({ items: [
    { name: 'Widget', price: 10, quantity: 3 },
    { name: 'Gadget', price: 25, quantity: 1 },
  ]})
  const order = await query.orderDetails({ id: 'current' })
  await approve(order)
})
```

The first run captures the output to an `__approvals__/` directory as the approved baseline. Subsequent runs compare against it. If the output changes, the test fails and shows a diff.

### Visual approvals (screenshots)

Use visual approvals when the behavior produces a UI -- rendered pages, dashboards, form states:

```typescript
import { approve } from '@aver/approvals'

test('dashboard renders correctly', async ({ act }) => {
  await act.navigateToDashboard()
  await approve.visual('dashboard-default')
})
```

Visual approvals capture a screenshot and compare it pixel-by-pixel against an approved baseline. They require a `screenshotter` extension from the protocol (available in Playwright adapters).

### Choosing structural vs visual

| Use structural when... | Use visual when... |
|------------------------|--------------------|
| Output is data (JSON, text, computed values) | Output is rendered UI |
| You care about specific field values | You care about layout, styling, alignment |
| The output is small and readable in a diff | Text content matters less than appearance |
| No browser/UI is involved | A Playwright adapter provides screenshots |

## Step 3: The Approval-First Workflow

This is the core cycle for legacy characterization:

### 1. Capture current behavior

Write a test that exercises the existing code path and calls `approve()` on the output. Run it once. The first run always passes and creates the approved baseline.

### 2. Review and approve

Inspect the captured baseline in `__approvals__/`. Does it look reasonable? This is the system's current behavior, warts and all. If it looks correct, the baseline stays. If it looks like a bug, record an observation:

```
Call record_observation with:
  behavior: "Order total includes tax twice when discount is applied"
  context: "Discovered via approval baseline -- calculateTotal returns 115 for
    items totaling 100 with 10% discount, expected ~90"
```

### 3. Make changes

Now modify the code. The approval test acts as a safety net. Run the tests after each change.

### 4. Diff shows what changed

When the output changes, the approval test fails with a clear diff showing exactly what is different. You can then decide:
- **Expected change:** Run with `AVER_APPROVE=true` to update the baseline
- **Unexpected change:** The safety net caught a regression. Fix the code.

### 5. Iterate

Repeat the capture-change-diff cycle. Each iteration either confirms the change is correct (update baseline) or catches a regression (fix the code).

## Step 4: Graduate to Named Assertions

Approval tests are blunt instruments -- they lock down the entire output. As you develop a clearer understanding of the behavior, graduate specific checks to named domain assertions.

**Before (approval-only):**

```typescript
test('apply discount to order', async ({ act, query }) => {
  await act.createOrder({ items: [{ name: 'Widget', price: 100, quantity: 1 }] })
  await act.applyDiscount({ code: 'SAVE10' })
  const order = await query.orderDetails({ id: 'current' })
  await approve(order)  // locks down the ENTIRE order object
})
```

**After (named assertions):**

```typescript
test('apply discount to order', async ({ act, assert }) => {
  await act.createOrder({ items: [{ name: 'Widget', price: 100, quantity: 1 }] })
  await act.applyDiscount({ code: 'SAVE10' })
  await assert.orderTotal({ id: 'current', expected: 90 })
  await assert.discountApplied({ id: 'current', code: 'SAVE10', amount: 10 })
})
```

Named assertions are:
- **More readable** -- the test communicates what matters
- **More resilient** -- unrelated output changes do not cause false failures
- **More reusable** -- the same assertion works across multiple tests

Graduate incrementally. Keep the approval test running alongside named assertions until you are confident the named assertions cover everything important.

## MCP Tools for This Pattern

| Tool | When to Use |
|------|------------|
| `record_observation` | Record behaviors discovered while reading legacy code. |
| `add_question` | Record questions about whether observed behavior is intended. |
| `get_workspace_items` | List items at each maturity stage. |
| `promote_item` | Move items forward with seam analysis in the rationale. |

## Anti-Patterns

- **Approving without reviewing.** The first run captures whatever the system does. If you approve blindly, you lock in bugs as "correct" behavior. Always inspect baselines.
- **Never graduating.** Approval tests are a starting point, not a destination. If you have 50 approval tests and zero named assertions, you have a fragile suite that breaks on any output change.
- **Modifying code before capturing.** The entire point is to capture current behavior first. If you change the code before writing the approval test, you lose the safety net.
- **Testing through only one seam.** Legacy systems often have inconsistencies between their API, UI, and internal logic. Capture behavior at multiple seams to find these gaps.
- **Skipping seam analysis.** Without identifying seams first, you end up writing tests that require the full system to be running. Find the narrowest seam that still exercises the behavior you care about.
