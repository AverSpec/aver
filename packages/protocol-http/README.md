# @averspec/protocol-http

> **Status: Early release.** API is stabilizing. Breaking changes will be noted in release notes.

HTTP protocol for [Aver](../../README.md) acceptance testing. Provides a fetch-based HTTP client as the adapter context.

## Install

```bash
npm install @averspec/protocol-http
```

## Usage

```typescript
import { adapt } from '@averspec/core'
import { http } from '@averspec/protocol-http'
import { cart } from './domains/cart'

export const httpAdapter = adapt(cart, {
  protocol: http({ baseUrl: 'http://localhost:3000' }),
  actions: {
    addItem: async (ctx, { name }) => {
      await ctx.post('/cart/items', { name })
    },
  },
  queries: {
    cartTotal: async (ctx) => {
      const res = await ctx.get('/cart/total')
      return res.json()
    },
  },
})
```

The `http()` protocol provides `get`, `post`, `put`, `patch`, and `delete` methods on the context, all pre-configured with the base URL.

## License

[MIT](../../LICENSE)
