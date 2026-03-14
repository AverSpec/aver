# @aver/core

> **Status: Stable** — API surface is locked for 0.x releases.

Domain-driven acceptance testing for TypeScript.

Define **what** to test in domain language. Swap **how** via adapters. Same test runs against in-memory objects, HTTP APIs, and browser UI.

## Install

```bash
npm install @aver/core vitest
```

## Usage

```typescript
import { expect } from 'vitest'
import { defineDomain, action, assertion, adapt, unit, suite } from '@aver/core'

const cart = defineDomain({
  name: 'cart',
  actions: { addItem: action<{ name: string }>() },
  queries: {},
  assertions: { hasItems: assertion<{ count: number }>() },
})

const adapter = adapt(cart, {
  protocol: unit(() => []),
  actions: { addItem: async (items, { name }) => { items.push(name) } },
  assertions: { hasItems: async (items, { count }) => {
    expect(items.length).toBe(count)
  }},
})

const { test } = suite(cart, adapter)

test('add item', async ({ act, assert }) => {
  await act.addItem({ name: 'Widget' })
  await assert.hasItems({ count: 1 })
})
```

## CLI

```bash
npx aver init    # interactive — prompts for domain name and protocol
npx aver run
```

## Documentation

See the [main README](../../README.md) for full documentation.

## Module Format Notes

@aver/core ships as both ESM and CJS. If both copies load in the same Node.js process, the global domain registry will split silently — domains registered via one format will not be visible to the other. In practice this is unlikely because vitest loads everything as ESM, so only one copy is active. If you encounter unexpected "domain not found" errors in a mixed ESM/CJS environment, duplicate module instances are the most likely cause.

## License

[MIT](../../LICENSE)
