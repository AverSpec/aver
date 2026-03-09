# Walkthrough: Legacy REST API Characterization

Agent discovers behaviors of a legacy orders API and progresses them through the scenario pipeline to acceptance tests.

**Scenario:** `POST /orders` with an empty cart returns `200` with an error field instead of `400`.

---

## 1. Investigation: Trace Code and Capture Scenarios

```bash
// Run: scenario-list.sh   -> count stages to detect phase: "kickoff" (no scenarios exist)
```

**Human:** "Orders API in production, no tests. Legacy characterization."

The agent reads source code, calls the API, and captures scenarios.

```bash
// Run: scenario-capture.sh --title "POST /orders with valid items creates order, returns 201"
//   (body includes context: curl: POST /orders {items:[{sku:'A1',qty:2}]} -> 201 {id:'ord_123'})
// -> creates issue #1, stage: captured

// Run: scenario-capture.sh --title "POST /orders with empty cart returns 200 with {error:'Cart is empty'} instead of 400"
//   (body includes context: src/routes/orders.ts:34 — res.json({error}) without setting status code)
// -> creates issue #2, stage: captured

// Run: scenario-question.sh 2 --body "Is the 200-for-errors pattern intentional or a bug?"
```

## 2. Characterization: Build Evidence

The agent traces code paths, identifies seams, captures approval baselines, then advances.

```bash
// Run: scenario-advance.sh 2 --to characterized
//   (comment includes rationale: OrderService.validate() returns {error} inline.
//    OrderController does res.json(result) without setting status — 200 is Express default.
//    Seam: OrderService.validate(). Approval baseline captured.)
// -> issue #2 label updated to stage:characterized
```

## 3. Mapping: Example Mapping with Human

**Agent:** "`POST /orders` with empty cart returns 200 with error. Investigation shows missing status code handling. **Is this intentional?**"

**Human:** "Intentional -- mobile client checks the error field, not status code."

```bash
// Run: scenario-resolve.sh 2 --comment-id <id> --body "Intentional for client compatibility. Mobile client checks error field."
```

**Rules:**
1. Empty items array returns `{error: 'Cart is empty'}` with status 200
2. Error response has no order ID
3. Non-empty items does NOT return an error field

| Rule | Given | When | Then |
|------|-------|------|------|
| Empty cart | items: `[]` | POST /orders | 200, `{error: 'Cart is empty'}` |
| Null items | items: `null` | POST /orders | 200, `{error: 'Cart is empty'}` |
| Valid order | items: `[{sku:'A1',qty:1}]` | POST /orders | 201, `{id:'...'}`, no error |

```bash
// Run: scenario-question.sh 2 --body "Verify exact error message or just that error field exists?"
// Human: "Verify exact string. Mobile client pattern-matches on it."
// Run: scenario-resolve.sh 2 --comment-id <id> --body "Verify exact error message. Mobile client pattern-matches on it."
```

Human confirms. Agent advances.

```bash
// Run: scenario-advance.sh 2 --to mapped
//   (comment includes rationale: Example Mapping complete. 3 rules, 3 examples.
//    All questions resolved. Human confirmed: 200-for-errors is intentional.)
// -> issue #2 label updated to stage:mapped
```

## 4. Specification: Name Vocabulary

**Agent:** "I propose: action `placeOrder`; query `lastOrderResponse`; assertions `orderCreated`, `orderRejectedWithError`. Do these names work?"

**Human:** "Yes."

```bash
// Read the domain source file for vocabulary (actions, queries, assertions)

// Run: scenario-advance.sh 2 --to specified
//   (comment includes rationale: Vocabulary confirmed: placeOrder, lastOrderResponse,
//    orderRejectedWithError. Adapter interfaces reviewed.)
// -> issue #2 label updated to stage:specified
```

## 5. Handoff: Dispatch to TDD

The outer loop dispatches to the TDD skill. Domain, tests, and adapter are written during `implemented`.

```typescript
// Test sketch (written by TDD subagent):
test('empty cart returns 200 with error message', async ({ act, assert }) => {
  await act.placeOrder({ items: [] })
  await assert.orderRejectedWithError({ message: 'Cart is empty', httpStatus: 200 })
})
```

```bash
// Run: pnpm exec aver run   -> 3 passed, 0 failed
// Compare test run output to detect newly passing/failing tests

// Run: gh issue edit 2 --body "..."
//   (update Domain Link section: ordersApi.placeOrder ->
//    "empty cart returns 200 with error message",
//    "null items returns 200 with error message")
```

**Agent:** "3 tests passing. All scenarios linked. The 200-for-errors behavior is documented as intentional."

---

## Key Takeaways

1. **Capture first** -- Discovered the pattern by testing, not guessing.
2. **Characterize with evidence** -- Approval baselines and seam analysis feed the mapping session.
3. **Human confirms intent** -- Never assume a behavior is a bug or intentional. Ask.
4. **Questions drive clarity** -- Resolved before writing tests.
5. **Pipeline is traceable** -- `captured` -> `characterized` -> `mapped` -> `specified` -> `implemented`.
