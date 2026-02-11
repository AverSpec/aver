---
layout: default
title: Getting Started
nav_order: 2
---

# Getting Started

This tutorial walks you through creating a domain, implementing an adapter, and writing your first test. By the end, you'll have a working Aver test suite.

## Prerequisites

- Node.js 18+
- A project with Vitest (or Jest) configured

## Install

```bash
npm install aver
```

## 1. Scaffold a Domain

The fastest way to get started:

```bash
npx aver init --domain ShoppingCart --protocol unit
```

This creates three files:

```
domains/shopping-cart.ts        # Domain definition
adapters/shopping-cart.unit.ts  # Adapter skeleton
tests/shopping-cart.spec.ts     # Test file
aver.config.ts                  # Config (if it doesn't exist)
```

## 2. Define Your Domain

A domain declares the vocabulary for a bounded context — what your system does, in business language:

```typescript
// domains/shopping-cart.ts
import { defineDomain, action, query, assertion } from 'aver'

export const shoppingCart = defineDomain({
  name: 'shopping-cart',
  actions: {
    addItem: action<{ name: string; qty: number }>(),
    removeItem: action<{ name: string }>(),
  },
  queries: {
    cartTotal: query<void, number>(),
  },
  assertions: {
    hasItems: assertion<{ count: number }>(),
    totalEquals: assertion<{ amount: number }>(),
  },
})
```

Three concepts make up the vocabulary:

| Concept | Purpose | Returns |
|:--------|:--------|:--------|
| **Action** | Do something (side effect) | void |
| **Query** | Read something | typed data |
| **Assertion** | Check something | pass/fail |

## 3. Implement an Adapter

An adapter binds domain vocabulary to a real implementation. Start with a `unit` adapter that tests against in-memory objects:

```typescript
// adapters/shopping-cart.unit.ts
import { implement, unit } from 'aver'
import { shoppingCart } from '../domains/shopping-cart'

interface CartItem { name: string; qty: number }

export const unitAdapter = implement(shoppingCart, {
  protocol: unit<CartItem[]>(() => []),

  actions: {
    addItem: async (items, { name, qty }) => {
      items.push({ name, qty })
    },
    removeItem: async (items, { name }) => {
      const idx = items.findIndex(i => i.name === name)
      if (idx >= 0) items.splice(idx, 1)
    },
  },

  queries: {
    cartTotal: async (items) => {
      return items.reduce((sum, i) => sum + i.qty * 9.99, 0)
    },
  },

  assertions: {
    hasItems: async (items, { count }) => {
      if (items.length !== count) {
        throw new Error(`Expected ${count} items, got ${items.length}`)
      }
    },
    totalEquals: async (items, { amount }) => {
      const total = items.reduce((sum, i) => sum + i.qty * 9.99, 0)
      if (total !== amount) {
        throw new Error(`Expected total ${amount}, got ${total}`)
      }
    },
  },
})
```

Key points:
- `unit(() => [])` creates a fresh context (empty array) for each test
- The first argument to every handler is the **protocol context** — whatever `unit()` returns
- TypeScript enforces that every action, query, and assertion from the domain is implemented

## 4. Register the Adapter

```typescript
// aver.config.ts
import { defineConfig } from 'aver'
import { unitAdapter } from './adapters/shopping-cart.unit'

export default defineConfig({
  adapters: [unitAdapter],
})
```

## 5. Write Tests

Tests speak domain language — no implementation details:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./aver.config.ts'],
  },
})
```

```typescript
// tests/shopping-cart.spec.ts
import { expect } from 'vitest'
import { suite } from 'aver'
import { shoppingCart } from '../domains/shopping-cart'

const { test } = suite(shoppingCart)

test('add item to cart', async ({ act, assert }) => {
  await act.addItem({ name: 'Widget', qty: 2 })
  await assert.hasItems({ count: 1 })
})

test('calculate total', async ({ act, query }) => {
  await act.addItem({ name: 'Widget', qty: 2 })
  const total = await query.cartTotal()
  expect(total).toBe(19.98)
})
```

The `{ act, query, assert }` callback provides typed proxies for each vocabulary category. Actions, queries, and assertions are separate namespaces.

## 6. Run Tests

```bash
npx vitest run
```

```
 ✓ tests/shopping-cart.spec.ts
   ✓ add item to cart [unit]
   ✓ calculate total [unit]
```

## Next Steps

- [Example App](example-app) — full task board tested across unit, HTTP, and Playwright
- [Architecture](architecture) — understand the three-layer model
- [Multi-Adapter Testing](guides/multi-adapter) — same test against HTTP and Playwright
- [MCP Server](guides/mcp-server) — AI-assisted testing with Claude
- [API Reference](api) — all exports documented
