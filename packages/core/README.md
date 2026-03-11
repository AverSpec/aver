# @aver/core

> **Status: Stable** — API surface is locked for 0.x releases.

Domain-driven acceptance testing for TypeScript.

Define **what** to test in domain language. Swap **how** via adapters. Same test runs against in-memory objects, HTTP APIs, and browser UI.

## Install

```bash
npm install @aver/core
```

## Usage

```typescript
import { expect } from 'vitest'
import { defineDomain, action, assertion, implement, unit, suite } from '@aver/core'

const cart = defineDomain({
  name: 'cart',
  actions: { addItem: action<{ name: string }>() },
  assertions: { hasItems: assertion<{ count: number }>() },
})

const adapter = implement(cart, {
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

## License

[MIT](../../LICENSE)
