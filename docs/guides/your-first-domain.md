---
layout: default
title: Your First Domain
parent: Guides
nav_order: 2
---

# Your First Domain

This guide shows how to extract a domain from untested legacy code. You will characterize existing behavior, define a vocabulary, refactor behind the domain boundary, and add a feature that was previously impossible.

## The legacy code

Here is a pricing calculator that every team has seen some version of. Calculation, formatting, and business policy are tangled into one function:

```typescript
// invoice.ts
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
  if (totalQty >= 50) {
    discountPct = 20
  } else if (totalQty >= 10) {
    discountPct = 10
  }

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

Three things make this hard to test. First, the only output is a formatted string — you must parse it to verify any number. Second, the discount tiers are hardcoded inside the function body, so you cannot test alternative policies. Third, there is no way to get the calculated total as a number for use in other code.

## Characterization tests

Before refactoring, lock in the current behavior so you know if you break something. Install the approvals package:

```bash
npm install --save-dev @aver/approvals
```

Write a characterization test that captures the exact output:

```typescript
// tests/invoice-characterization.spec.ts
import { test } from 'vitest'
import { approve } from '@aver/approvals'
import { calculateInvoice } from '../invoice.js'

test('invoice with quantity discount', () => {
  const result = calculateInvoice([
    { product: 'Widget', quantity: 15, unitPrice: 9.99 },
  ])
  approve(result)
})

test('invoice without discount', () => {
  const result = calculateInvoice([
    { product: 'Gadget', quantity: 3, unitPrice: 24.99 },
  ])
  approve(result)
})
```

On the first run, set `AVER_APPROVE=1` to create baseline files:

```bash
AVER_APPROVE=1 npx aver run tests/invoice-characterization.spec.ts
```

This writes `.approved` files containing the exact output. Every subsequent run compares against those baselines. If the output changes, the test fails and shows a diff. You now have a safety net.

## Extract the domain

Look at what the characterization tests revealed. The function does three things: accumulates line items, applies discount rules, and computes a taxed total. Name these in domain language:

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
    noDiscount: assertion<void>(),
  },
})
```

The vocabulary says nothing about formatting, hardcoded tiers, or tax rates. It describes what pricing *means* to the business.

## Write acceptance tests

With the domain defined, write tests using `given`/`when`/`then` for narrative clarity:

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

test('tax applied after discount', async ({ given, then }) => {
  await given.addLineItem({ product: 'Widget', quantity: 50, unitPrice: 1.00 })
  await then.discountApplied({ percent: 20 })
  await then.totalEquals({ expected: 43.20 }) // 50 * 0.8 * 1.08
})
```

These tests will not pass yet. There is no adapter and no implementation.

## Implement the adapter

The adapter binds the domain vocabulary to a real implementation. Use the `unit` protocol for in-process testing:

```typescript
// adapters/pricing.unit.ts
import { implement, unit } from '@aver/core'
import { expect } from 'vitest'
import { pricing } from '../domains/pricing.js'
import { InvoiceCalculator } from '../invoice-calculator.js'

export const unitAdapter = implement(pricing, {
  protocol: unit(() => {
    return { calc: new InvoiceCalculator() }
  }),
  actions: {
    addLineItem: async (ctx, { product, quantity, unitPrice }) => {
      ctx.calc.addItem(product, quantity, unitPrice)
    },
  },
  queries: {
    invoiceTotal: async (ctx) => ctx.calc.total,
    appliedDiscount: async (ctx) => ctx.calc.discount,
  },
  assertions: {
    totalEquals: async (ctx, { expected }) => {
      expect(ctx.calc.total).toBeCloseTo(expected, 2)
    },
    discountApplied: async (ctx, { percent }) => {
      expect(ctx.calc.discount).toBe(percent)
    },
    noDiscount: async (ctx) => {
      expect(ctx.calc.discount).toBe(0)
    },
  },
})
```

## Build the implementation

Now write the `InvoiceCalculator` class with separated concerns. Calculation is distinct from formatting. Discount tiers are configurable:

```typescript
// invoice-calculator.ts
export interface DiscountTier {
  minQuantity: number
  percent: number
}

const DEFAULT_TIERS: DiscountTier[] = [
  { minQuantity: 50, percent: 20 },
  { minQuantity: 10, percent: 10 },
]

export class InvoiceCalculator {
  private items: Array<{ product: string; quantity: number; unitPrice: number }> = []
  private tiers: DiscountTier[]
  private taxRate: number

  constructor(tiers: DiscountTier[] = DEFAULT_TIERS, taxRate = 0.08) {
    this.tiers = [...tiers].sort((a, b) => b.minQuantity - a.minQuantity)
    this.taxRate = taxRate
  }

  addItem(product: string, quantity: number, unitPrice: number): void {
    this.items.push({ product, quantity, unitPrice })
  }

  get subtotal(): number {
    return this.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
  }

  get totalQuantity(): number {
    return this.items.reduce((sum, i) => sum + i.quantity, 0)
  }

  get discount(): number {
    const tier = this.tiers.find((t) => this.totalQuantity >= t.minQuantity)
    return tier?.percent ?? 0
  }

  get total(): number {
    const afterDiscount = this.subtotal * (1 - this.discount / 100)
    return afterDiscount * (1 + this.taxRate)
  }
}
```

Register the adapter in `aver.config.ts` and run:

```bash
npx aver run tests/pricing.spec.ts
```

All four tests pass.

## Add the impossible feature

The original `calculateInvoice()` hardcoded its discount tiers. Changing them meant editing the function body. Now add a test with a custom tier — 5+ items at 15% off:

```typescript
test('custom discount tier', async ({ given, then }) => {
  await given.addLineItem({ product: 'Widget', quantity: 5, unitPrice: 20.00 })
  await then.discountApplied({ percent: 15 })
  await then.totalEquals({ expected: 91.80 }) // 100 * 0.85 * 1.08
})
```

The only change is in the adapter setup — pass different tiers to the constructor:

```typescript
protocol: unit(() => {
  const customTiers = [{ minQuantity: 5, percent: 15 }]
  return { calc: new InvoiceCalculator(customTiers) }
}),
```

The domain vocabulary stays identical. The test passes without touching any domain or assertion code.

The refactoring enabled this. The original function would have required editing hardcoded values and hoping nothing else broke. With a domain boundary, the implementation is free to evolve while the vocabulary remains stable.

## Next steps

- Add a second adapter to verify the same behavior through your API — [Multi-Adapter Testing](multi-adapter.md)
- Learn Example Mapping to discover scenarios collaboratively — [Example Mapping](example-mapping.md)
