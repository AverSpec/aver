---
layout: default
title: Tutorial
nav_order: 2
---

# Tutorial: From Legacy Code to Multi-Adapter Tests

This tutorial takes you from untested legacy code to a domain-driven test suite running against two adapters. It takes about 15 minutes.

You'll build a real test suite that:
1. Locks in existing behavior with approval tests
2. Extracts a domain vocabulary
3. Runs the same tests against both a unit adapter and an HTTP adapter

---

## The starting point

Here's a pricing calculator like the ones that exist in every codebase. Calculation, formatting, and business policy are tangled into one function:

```typescript
// src/invoice.ts
export function calculateInvoice(
  items: Array<{ product: string; quantity: number; unitPrice: number }>,
): string {
  let subtotal = 0
  let totalQty = 0
  for (const item of items) {
    subtotal += item.quantity * item.unitPrice
    totalQty += item.quantity
  }

  let discountPct = 0
  if (totalQty >= 50) discountPct = 20
  else if (totalQty >= 10) discountPct = 10

  const discountAmount = subtotal * (discountPct / 100)
  const afterDiscount = subtotal - discountAmount
  const tax = afterDiscount * 0.08
  const total = afterDiscount + tax

  return [
    `Subtotal: $${subtotal.toFixed(2)}`,
    `Discount: ${discountPct}%`,
    `Tax: $${tax.toFixed(2)}`,
    `Total: $${total.toFixed(2)}`,
  ].join('\n')
}
```

Three things make this hard to test: the only output is a formatted string, the discount tiers are hardcoded, and there's no way to get the total as a number.

## Step 1: Lock in what exists

Before changing anything, capture the current behavior as a safety net.

```bash
npm install --save-dev @aver/core @aver/approvals vitest
```

```typescript
// tests/invoice-characterization.spec.ts
import { test } from 'vitest'
import { approve } from '@aver/approvals'
import { calculateInvoice } from '../src/invoice.js'

test('invoice with quantity discount', async () => {
  const result = calculateInvoice([
    { product: 'Widget', quantity: 15, unitPrice: 9.99 },
  ])
  await approve(result)
})

test('invoice without discount', async () => {
  const result = calculateInvoice([
    { product: 'Gadget', quantity: 3, unitPrice: 24.99 },
  ])
  await approve(result)
})
```

Create the baselines:

```bash
AVER_APPROVE=1 npx vitest run tests/invoice-characterization.spec.ts
```

This writes `.approved` files containing the exact output. Every subsequent run compares against those baselines. Now you have a safety net — any change to the function's output fails the test with a diff.

## Step 2: Name the behaviors

Look at what the characterization tests revealed. The function accumulates line items, applies discount rules, and computes a taxed total. Name these in domain language:

```typescript
// domains/pricing.ts
import { defineDomain, action, query, assertion } from '@aver/core'

export const pricing = defineDomain({
  name: 'pricing',
  actions: {
    addLineItem: action<{ product: string; quantity: number; unitPrice: number }>(),
  },
  queries: {
    invoiceTotal: query<void, number>(),
    appliedDiscount: query<void, number>(),
  },
  assertions: {
    totalEquals: assertion<{ expected: number }>(),
    discountApplied: assertion<{ percent: number }>(),
    noDiscount: assertion(),
  },
})
```

The vocabulary says nothing about formatting, hardcoded tiers, or tax rates. It describes what pricing *means* to the business.

## Step 3: Write acceptance tests

Tests use domain language only. No implementation details leak in:

```typescript
// tests/pricing.spec.ts
import { suite } from '@aver/core'
import { pricing } from '../domains/pricing.js'

const { test } = suite(pricing)

test('basic invoice total', async ({ given, when, then }) => {
  await given.addLineItem({ product: 'Widget', quantity: 2, unitPrice: 10.00 })
  await when.addLineItem({ product: 'Gadget', quantity: 1, unitPrice: 5.00 })
  await then.totalEquals({ expected: 27.00 }) // (20 + 5) * 1.08
})

test('quantity discount kicks in at 10 items', async ({ given, then }) => {
  await given.addLineItem({ product: 'Widget', quantity: 10, unitPrice: 10.00 })
  await then.discountApplied({ percent: 10 })
  await then.totalEquals({ expected: 97.20 }) // 100 * 0.9 * 1.08
})

test('no discount below threshold', async ({ given, then }) => {
  await given.addLineItem({ product: 'Widget', quantity: 5, unitPrice: 10.00 })
  await then.noDiscount()
  await then.totalEquals({ expected: 54.00 }) // 50 * 1.08
})
```

These tests won't pass yet — there's no adapter.

## Step 4: Build the unit adapter

An adapter binds domain vocabulary to a real implementation. Start with the `unit` protocol for in-memory testing:

```typescript
// adapters/pricing.unit.ts
import { implement, unit } from '@aver/core'
import { expect } from 'vitest'
import { pricing } from '../domains/pricing.js'

interface PricingContext {
  items: Array<{ product: string; quantity: number; unitPrice: number }>
}

function calculate(ctx: PricingContext) {
  const subtotal = ctx.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const totalQty = ctx.items.reduce((s, i) => s + i.quantity, 0)
  const discountPct = totalQty >= 50 ? 20 : totalQty >= 10 ? 10 : 0
  const afterDiscount = subtotal * (1 - discountPct / 100)
  return { subtotal, discountPct, total: afterDiscount * 1.08 }
}

export const unitAdapter = implement(pricing, {
  protocol: unit((): PricingContext => ({ items: [] })),
  actions: {
    addLineItem: async (ctx, item) => { ctx.items.push(item) },
  },
  queries: {
    invoiceTotal: async (ctx) => calculate(ctx).total,
    appliedDiscount: async (ctx) => calculate(ctx).discountPct,
  },
  assertions: {
    totalEquals: async (ctx, { expected }) => {
      expect(calculate(ctx).total).toBeCloseTo(expected, 2)
    },
    discountApplied: async (ctx, { percent }) => {
      expect(calculate(ctx).discountPct).toBe(percent)
    },
    noDiscount: async (ctx) => {
      expect(calculate(ctx).discountPct).toBe(0)
    },
  },
})
```

Register it:

```typescript
// aver.config.ts
import { defineConfig } from '@aver/core'
import { unitAdapter } from './adapters/pricing.unit.js'

export default defineConfig({
  adapters: [unitAdapter],
})
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { setupFiles: ['./aver.config.ts'] },
})
```

Run it:

```bash
npx aver run tests/pricing.spec.ts
```

```
 ✓ basic invoice total [unit]                    1ms
 ✓ quantity discount kicks in at 10 items [unit]  0ms
 ✓ no discount below threshold [unit]             0ms
```

Three tests pass against the unit adapter.

## Step 5: Add an HTTP adapter

Now suppose you have an Express API for pricing. Here's a minimal server:

```typescript
// src/server.ts
import express from 'express'

const app = express()
app.use(express.json())

const sessions = new Map<string, Array<{ product: string; quantity: number; unitPrice: number }>>()

app.post('/session', (req, res) => {
  const id = crypto.randomUUID()
  sessions.set(id, [])
  res.json({ id })
})

app.post('/session/:id/items', (req, res) => {
  sessions.get(req.params.id)?.push(req.body)
  res.sendStatus(204)
})

app.get('/session/:id/total', (req, res) => {
  const items = sessions.get(req.params.id) ?? []
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const totalQty = items.reduce((s, i) => s + i.quantity, 0)
  const discountPct = totalQty >= 50 ? 20 : totalQty >= 10 ? 10 : 0
  const afterDiscount = subtotal * (1 - discountPct / 100)
  res.json({ total: afterDiscount * 1.08, discountPct })
})

export { app }
```

Write an HTTP adapter for the same domain:

```typescript
// adapters/pricing.http.ts
import { implement } from '@aver/core'
import { expect } from 'vitest'
import { pricing } from '../domains/pricing.js'
import type { Protocol } from '@aver/core'
import { app } from '../src/server.js'

interface HttpContext {
  baseUrl: string
  sessionId: string
  server: any
}

const protocol: Protocol<HttpContext> = {
  name: 'http',
  async setup() {
    const server = app.listen(0)
    const port = (server.address() as any).port
    const baseUrl = `http://localhost:${port}`
    const res = await fetch(`${baseUrl}/session`, { method: 'POST' })
    const { id } = await res.json() as { id: string }
    return { baseUrl, sessionId: id, server }
  },
  async teardown(ctx) {
    ctx.server.close()
  },
}

export const httpAdapter = implement(pricing, {
  protocol,
  actions: {
    addLineItem: async (ctx, item) => {
      await fetch(`${ctx.baseUrl}/session/${ctx.sessionId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      })
    },
  },
  queries: {
    invoiceTotal: async (ctx) => {
      const res = await fetch(`${ctx.baseUrl}/session/${ctx.sessionId}/total`)
      const data = await res.json() as { total: number }
      return data.total
    },
    appliedDiscount: async (ctx) => {
      const res = await fetch(`${ctx.baseUrl}/session/${ctx.sessionId}/total`)
      const data = await res.json() as { discountPct: number }
      return data.discountPct
    },
  },
  assertions: {
    totalEquals: async (ctx, { expected }) => {
      const total = await (await fetch(`${ctx.baseUrl}/session/${ctx.sessionId}/total`)).json() as { total: number }
      expect(total.total).toBeCloseTo(expected, 2)
    },
    discountApplied: async (ctx, { percent }) => {
      const data = await (await fetch(`${ctx.baseUrl}/session/${ctx.sessionId}/total`)).json() as { discountPct: number }
      expect(data.discountPct).toBe(percent)
    },
    noDiscount: async (ctx) => {
      const data = await (await fetch(`${ctx.baseUrl}/session/${ctx.sessionId}/total`)).json() as { discountPct: number }
      expect(data.discountPct).toBe(0)
    },
  },
})
```

Register both adapters:

```typescript
// aver.config.ts
import { defineConfig } from '@aver/core'
import { unitAdapter } from './adapters/pricing.unit.js'
import { httpAdapter } from './adapters/pricing.http.js'

export default defineConfig({
  adapters: [unitAdapter, httpAdapter],
})
```

Run the tests again — **the same tests, no changes**:

```bash
npx aver run tests/pricing.spec.ts
```

```
 ✓ basic invoice total [unit]                      1ms
 ✓ basic invoice total [http]                     18ms
 ✓ quantity discount kicks in at 10 items [unit]    0ms
 ✓ quantity discount kicks in at 10 items [http]   12ms
 ✓ no discount below threshold [unit]               0ms
 ✓ no discount below threshold [http]               9ms
```

Three tests. Two adapters. Six runs. The test code didn't change — only the config did.

If the unit adapter and HTTP adapter ever disagree on a behavior, that disagreement surfaces a real bug: the API returns different data than the in-memory implementation.

---

## What you built

```
domains/pricing.ts           # Domain vocabulary — what pricing means
adapters/pricing.unit.ts     # Unit adapter — in-memory implementation
adapters/pricing.http.ts     # HTTP adapter — Express API
tests/pricing.spec.ts        # Tests — domain language only
aver.config.ts               # Config — registers adapters
```

The domain vocabulary is the stable center. Tests compose vocabulary into scenarios. Adapters are interchangeable. Add a Playwright adapter when the UI exists — the tests still don't change.

## Next steps

- [Architecture](architecture) — how the three-layer model works and why
- [Getting Started](guides/getting-started) — install, scaffold, and configure a fresh project
- [Multi-Adapter Testing](guides/multi-adapter) — adding Playwright and protocol-specific tests
- [CI Integration](guides/ci-integration) — running aver tests in your pipeline
