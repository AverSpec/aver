# Walkthrough: Legacy REST API Characterization

A complete session trace showing an agent discovering behaviors of a legacy orders API and progressing them through the maturity pipeline to formalized acceptance tests.

**Scenario:** A legacy REST API where `POST /orders` with an empty cart returns `200` with an error field instead of `400`. The agent discovers this, confirms it with the human, and builds tests that document the behavior.

---

## 1. Kickoff

The agent starts by checking the current phase.

```json
// Tool: get_workflow_phase → Response:
{ "phase": "kickoff", "reason": "Workspace is empty." }
```

**Agent:** "What system are we working on? Legacy characterization or new development?"

**Human:** "We have an orders API in production for two years. No tests. I want to wrap it before we refactor the error handling. Legacy characterization."

## 2. Discovery: Observe and Investigate

The agent reads source code and calls the API. It finds the orders endpoint at `src/routes/orders.ts`.

```json
// Tool: record_observation
{ "behavior": "POST /orders with valid items creates an order and returns 201 with order ID",
  "context": "curl: POST /orders {items: [{sku: 'A1', qty: 2}]} -> 201 {id: 'ord_123'}" }
// → { "id": "obs_001", "stage": "observed" }
```

The agent discovers an unusual error handling pattern:

```json
// Tool: record_observation
{ "behavior": "POST /orders with empty cart returns 200 with {error: 'Cart is empty'} instead of 400",
  "context": "src/routes/orders.ts:34 uses res.json({error}) without setting status code." }
// → { "id": "obs_002", "stage": "observed" }
```

```json
// Tool: record_observation
{ "behavior": "GET /orders/:id returns the full order object including items, total, and status",
  "context": "curl: GET /orders/ord_123 -> 200 {id, items, total, status: 'pending'}" }
// → { "id": "obs_003", "stage": "observed" }
```

The agent records a question about the unusual pattern:

```json
// Tool: add_question
{ "itemId": "obs_002",
  "text": "Is the 200-for-errors pattern intentional (client compat) or a bug?" }
// → { "questionId": "q_001" }
```

The agent traces the code: `POST /orders` -> `OrderController.create()` -> `OrderService.validate()` -> `OrderService.save()`. It identifies `OrderService.create()` as a clean seam.

After investigation, the agent promotes each observation with technical rationale:

```json
// Tool: promote_item
{ "id": "obs_001",
  "rationale": "Code path: POST /orders -> OrderController.create() -> OrderService.validate() ->
    OrderService.save(). Seam: OrderService.create(items) is a clean function boundary.",
  "promotedBy": "development" }
// → { "stage": "explored" }
```

```json
// Tool: promote_item
{ "id": "obs_002",
  "rationale": "OrderService.validate() returns {error} inline rather than throwing.
    OrderController does res.json(result) without setting status code -- 200 is Express default.
    Seam: OrderService.validate() returns errors inline.",
  "promotedBy": "development" }
// → { "stage": "explored" }
```

## 3. Mapping: Confirm Intent with the Human

The Business perspective decides what is intentional.

**Agent:** "POST /orders with empty cart returns 200 with `{error: 'Cart is empty'}`. Investigation shows this is a side effect of missing status code handling. **Is this intentional?**"

**Human:** "Intentional for now -- our mobile client checks the error field, not the status code. Tests should capture current behavior."

```json
// Tool: resolve_question
{ "itemId": "obs_002", "questionId": "q_001",
  "answer": "Intentional for client compatibility. Mobile client checks the error field." }
```

```json
// Tool: promote_item
{ "id": "obs_002",
  "rationale": "Human confirmed: 200-for-errors is intentional client compatibility.
    Tests should document current behavior.",
  "promotedBy": "business" }
// → { "stage": "intended" }
```

The agent promotes the other items similarly after human confirmation.

## 4. Formalization: Example Mapping

**Story:** "POST /orders with empty cart returns 200 with error field"

**Rules:**
1. Empty items array returns `{error: 'Cart is empty'}` with status 200
2. Error response has no order ID
3. Non-empty items array does NOT return an error field

**Examples:**

| Rule | Given | When | Then |
|------|-------|------|------|
| Empty cart | items: `[]` | POST /orders | 200, `{error: 'Cart is empty'}` |
| Null items | items: `null` | POST /orders | 200, `{error: 'Cart is empty'}` |
| Valid order | items: `[{sku: 'A1', qty: 1}]` | POST /orders | 201, `{id: '...'}`, no error field |

```json
// Tool: add_question
{ "itemId": "obs_002",
  "text": "Should tests verify the exact error message string or just that an error field exists?" }
```

**Human:** "Verify the exact string. The mobile client pattern-matches on it."

```json
// Tool: resolve_question
{ "itemId": "obs_002", "questionId": "q_002",
  "answer": "Verify exact error message. Mobile client pattern-matches on it." }
```

**Agent:** "I propose: action `placeOrder`; queries `orderDetails`, `lastOrderResponse`; assertions `orderCreated`, `orderRejectedWithError`. Do these names work?"

**Human:** "Yes."

```json
// Tool: promote_item
{ "id": "obs_002",
  "rationale": "Example Mapping complete. 3 rules, 3 examples. Domain operations:
    placeOrder, lastOrderResponse, orderRejectedWithError. Exact message matching required.",
  "promotedBy": "testing" }
// → { "stage": "formalized" }
```

## 5. Implementation: TDD Inner Loop

### 5a. Scaffold the domain

```json
// Tool: describe_domain_structure
{ "description": "orders API" }
// → { "suggestedName": "ordersApi", "template": { ... } }
```

```typescript
// domains/orders-api.ts
export const ordersApi = defineDomain({
  name: 'orders-api',
  actions: {
    placeOrder: action<{ items: Array<{ sku: string; qty: number }> | null }>(),
  },
  queries: {
    orderDetails: query<{ id: string }, { id: string; total: number; status: string } | undefined>(),
    lastOrderResponse: query<void, { status: number; body: Record<string, unknown> }>(),
  },
  assertions: {
    orderCreated: assertion<{ itemCount: number }>(),
    orderRejectedWithError: assertion<{ message: string; httpStatus: number }>(),
  },
})
```

### 5b. Write failing tests

```typescript
// tests/orders-api.spec.ts
const { test } = suite(ordersApi)

test('empty cart returns 200 with error message', async ({ act, assert }) => {
  await act.placeOrder({ items: [] })
  await assert.orderRejectedWithError({ message: 'Cart is empty', httpStatus: 200 })
})

test('null items returns 200 with error message', async ({ act, assert }) => {
  await act.placeOrder({ items: null })
  await assert.orderRejectedWithError({ message: 'Cart is empty', httpStatus: 200 })
})

test('valid order returns 201 with order ID', async ({ act, assert }) => {
  await act.placeOrder({ items: [{ sku: 'WIDGET-1', qty: 2 }] })
  await assert.orderCreated({ itemCount: 1 })
})
```

### 5c. Implement and run

The agent implements the unit adapter replicating the legacy behavior (200 for errors).

```json
// Tool: run_tests
{ "domain": "orders-api" }
// → { "passed": 3, "failed": 0 }
```

### 5d. Link workspace items

```json
// Tool: link_to_domain
{ "itemId": "obs_002", "domainOperation": "ordersApi.placeOrder",
  "testNames": ["empty cart returns 200 with error message",
                 "null items returns 200 with error message"] }
```

## 6. Verification

```json
// Tool: run_tests → { "passed": 3, "failed": 0 }
// Tool: get_run_diff → { "newlyPassing": ["empty cart...", "null items...", "valid order..."],
//                        "newlyFailing": [], "stillFailing": [] }
```

**Agent:** "Verification complete. 3 tests passing. All formalized items linked. The 200-for-errors behavior is documented as intentional legacy behavior. When you refactor, these tests will catch the change."

```json
// Tool: export_workspace
{ "format": "markdown" }
// → Portable summary for PR description and future sessions
```

---

## Key Takeaways

1. **Observation first** -- The agent discovered the 200-for-errors pattern by testing the API, not by guessing.
2. **Human confirms intent** -- The agent did not assume the behavior was a bug or intentional. It asked.
3. **Questions drive clarity** -- Open questions surfaced during discovery and formalization were resolved before writing tests.
4. **Tests document legacy behavior** -- The acceptance tests capture what the system does now, creating a safety net for the refactor.
5. **The pipeline is traceable** -- Every item progressed from observed to explored to intended to formalized, with rationale at each step.
