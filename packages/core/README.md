# aver

Domain-driven acceptance testing for TypeScript.

Define **what** to test in domain language. Swap **how** via adapters. Same test runs against in-memory objects, HTTP APIs, and browser UI.

## Install

```bash
npm install aver
```

## Usage

```typescript
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
    if (items.length !== count) throw new Error(`Expected ${count} items`)
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
npx aver init --domain ShoppingCart --protocol unit
npx aver run
```

## Documentation

See the [main README](../../README.md) for full documentation.

## License

[MIT](../../LICENSE)
