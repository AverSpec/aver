import { describe, it, expect } from 'vitest'
import { http, withAction } from '../src/index'

describe('http()', () => {
  it('creates a protocol with name "http"', () => {
    const protocol = http({ baseUrl: 'http://localhost:3000' })
    expect(protocol.name).toBe('http')
    expect(typeof protocol.setup).toBe('function')
    expect(typeof protocol.teardown).toBe('function')
  })

  it('setup returns context with HTTP methods', async () => {
    const protocol = http({ baseUrl: 'http://localhost:3000' })
    const ctx = await protocol.setup()
    expect(typeof ctx.get).toBe('function')
    expect(typeof ctx.post).toBe('function')
    expect(typeof ctx.put).toBe('function')
    expect(typeof ctx.patch).toBe('function')
    expect(typeof ctx.delete).toBe('function')
  })

  it('strips trailing slash from baseUrl', async () => {
    const protocol = http({ baseUrl: 'http://localhost:3000/' })
    const ctx = await protocol.setup()
    expect(ctx).toBeDefined()
  })
})

describe('withAction()', () => {
  it('returns an HttpContext with the same methods', async () => {
    const protocol = http({ baseUrl: 'http://localhost:3000' })
    const ctx = await protocol.setup()
    const wrapped = withAction('add item', ctx)
    expect(typeof wrapped.get).toBe('function')
    expect(typeof wrapped.post).toBe('function')
    expect(typeof wrapped.put).toBe('function')
    expect(typeof wrapped.patch).toBe('function')
    expect(typeof wrapped.delete).toBe('function')
  })

  it('wraps a thrown error with the action name', async () => {
    const protocol = http({ baseUrl: 'http://localhost:3000' })
    const ctx = await protocol.setup()
    const wrapped = withAction('add item', ctx)

    // GET to an unreachable host triggers a network error from the http() layer,
    // which in turn gets re-wrapped by withAction().
    await expect(wrapped.get('/path')).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof Error &&
        err.message.startsWith('Action "add item" failed:') &&
        err.cause instanceof Error
      )
    })
  })

  it('preserves the original error as the cause', async () => {
    const fakeCtx = {
      get: async () => {
        throw new Error('original network error')
      },
      post: async () => { throw new Error('original network error') },
      put: async () => { throw new Error('original network error') },
      patch: async () => { throw new Error('original network error') },
      delete: async () => { throw new Error('original network error') },
    }

    const wrapped = withAction('submit order', fakeCtx)

    await expect(wrapped.get('/api/order')).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof Error &&
        err.message === 'Action "submit order" failed: original network error' &&
        (err.cause as Error).message === 'original network error'
      )
    })
  })

  it('handles non-Error throws by converting to Error', async () => {
    const fakeCtx = {
      get: async () => { throw 'string error' },
      post: async () => { throw 'string error' },
      put: async () => { throw 'string error' },
      patch: async () => { throw 'string error' },
      delete: async () => { throw 'string error' },
    }

    const wrapped = withAction('do thing', fakeCtx)

    await expect(wrapped.post('/api/thing', {})).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof Error &&
        err.message === 'Action "do thing" failed: string error'
      )
    })
  })
})
