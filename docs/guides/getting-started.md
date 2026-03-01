---
layout: default
title: Getting Started
parent: Guides
nav_order: 1
---

# Getting Started

This guide walks you through creating your first Aver domain, adapter, and test in about five minutes.

## Prerequisites

- Node.js 18+
- A package manager (npm, pnpm, or yarn)

## Install

```bash
npm install --save-dev @aver/core vitest
```

Aver uses [Vitest](https://vitest.dev) as its test runner.

## Option A: Scaffold with `aver init`

The fastest way to start is the interactive scaffold:

```bash
npx aver init --domain ShoppingCart --protocol unit
```

This creates the project structure, a starter domain, adapter, and config file. Skip ahead to [Run your tests](#run-your-tests) if you use this path.

## Option B: Manual setup

If you prefer to understand each piece, follow along below.

### 1. Define a domain

A domain is a named vocabulary that describes **what** your system does, without any implementation details. Create `domains/shopping-cart.ts`:

```typescript
import { defineDomain, action, query, assertion } from '@aver/core'

export const shoppingCart = defineDomain({
  name: 'shopping-cart',
  actions: {
    addItem: action<{ product: string; quantity: number }>(),
    removeItem: action<{ product: string }>(),
  },
  queries: {
    cartContents: query<void, Array<{ product: string; quantity: number }>>(),
  },
  assertions: {
    cartContains: assertion<{ product: string; quantity: number }>(),
    cartIsEmpty: assertion<void>(),
  },
})
```

Three building blocks:

- **Actions** change state (`addItem`, `removeItem`)
- **Queries** read state (`cartContents`)
- **Assertions** verify state (`cartContains`, `cartIsEmpty`)

### 2. Implement an adapter

An adapter binds your domain vocabulary to a real implementation. The `unit` protocol runs everything in-memory — no servers, no browsers. Create `adapters/shopping-cart.unit.ts`:

```typescript
import { implement, unit } from '@aver/core'
import { expect } from 'vitest'
import { shoppingCart } from '../domains/shopping-cart.js'

export const unitAdapter = implement(shoppingCart, {
  protocol: unit(() => {
    const items: Map<string, number> = new Map()
    return { items }
  }),
  actions: {
    addItem: async (ctx, { product, quantity }) => {
      ctx.items.set(product, (ctx.items.get(product) ?? 0) + quantity)
    },
    removeItem: async (ctx, { product }) => {
      ctx.items.delete(product)
    },
  },
  queries: {
    cartContents: async (ctx) => {
      return [...ctx.items.entries()].map(([product, quantity]) => ({
        product,
        quantity,
      }))
    },
  },
  assertions: {
    cartContains: async (ctx, { product, quantity }) => {
      expect(ctx.items.get(product)).toBe(quantity)
    },
    cartIsEmpty: async (ctx) => {
      expect(ctx.items.size).toBe(0)
    },
  },
})
```

The `unit()` function creates a fresh context for each test. Here it returns a `Map` that acts as our in-memory cart. Assertions use Vitest's `expect` for clear failure messages.

### 3. Configure Aver

Register your adapter so Aver knows about it. Create `aver.config.ts`:

```typescript
import { defineConfig } from '@aver/core'
import { unitAdapter } from './adapters/shopping-cart.unit.js'

export default defineConfig({
  adapters: [unitAdapter],
})
```

### 4. Configure Vitest

Create or update `vitest.config.ts` to load the Aver config as a setup file:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./aver.config.ts'],
  },
})
```

### 5. Write a test

Tests use domain language only — no implementation details leak in. Create `tests/shopping-cart.spec.ts`:

```typescript
import { suite } from '@aver/core'
import { expect } from 'vitest'
import { shoppingCart } from '../domains/shopping-cart.js'

const { test } = suite(shoppingCart)

test('add items to cart', async ({ act, assert }) => {
  await act.addItem({ product: 'Widget', quantity: 2 })
  await assert.cartContains({ product: 'Widget', quantity: 2 })
})

test('remove items from cart', async ({ act, assert }) => {
  await act.addItem({ product: 'Gadget', quantity: 1 })
  await act.removeItem({ product: 'Gadget' })
  await assert.cartIsEmpty()
})

test('query cart contents', async ({ act, query }) => {
  await act.addItem({ product: 'Widget', quantity: 3 })
  const contents = await query.cartContents()
  expect(contents).toEqual([{ product: 'Widget', quantity: 3 }])
})
```

Notice that `suite(shoppingCart)` gives you a typed `test` function. The test context provides `act`, `query`, and `assert` — all fully typed from your domain definition.

> **Tip: Given-When-Then aliases.** The test context also provides `given`, `when`, and `then` as aliases for `act`, `act`, and `assert`. These read more naturally for BDD-style tests:
>
> ```typescript
> test('add and verify item', async ({ given, when, then }) => {
>   await given.addItem({ product: 'Widget', quantity: 2 })
>   await when.addItem({ product: 'Gadget', quantity: 1 })
>   await then.cartContains({ product: 'Widget', quantity: 2 })
> })
> ```

## Run your tests

```bash
npx aver run
```

You should see output like:

```
 ✓ add items to cart [unit]
 ✓ remove items from cart [unit]
 ✓ query cart contents [unit]
```

The `[unit]` suffix shows which adapter ran. When you add more adapters later, each test runs against all of them automatically.

## Project structure

Your project should now look like this:

```
aver.config.ts
vitest.config.ts
domains/
  shopping-cart.ts
adapters/
  shopping-cart.unit.ts
tests/
  shopping-cart.spec.ts
```

## Next steps

- [Multi-Adapter Testing](multi-adapter.md) — add HTTP and Playwright adapters so the same tests verify your API and UI
- [CI Integration](ci-integration.md) — run Aver tests in your CI pipeline
- [API Reference](../api.md) — deeper look at domains, adapters, protocols, and suites
