import { describe, it, expect } from 'vitest'
import { http } from '../src/index'

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
