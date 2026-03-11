import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { http, withAction } from '../src/index'

describe('http() integration', () => {
  let server: Server | undefined

  afterEach(async () => {
    if (server) {
      await new Promise<void>(resolve => server!.close(() => resolve()))
      server = undefined
    }
  })

  function startServer(handler: (req: any, res: any) => void): Promise<number> {
    return new Promise(resolve => {
      server = createServer(handler)
      server.listen(0, () => {
        const addr = server!.address()
        const port = typeof addr === 'object' && addr ? addr.port : 0
        resolve(port)
      })
    })
  }

  it('makes a real GET request and receives the response', async () => {
    const port = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ message: 'hello' }))
    })

    const protocol = http({ baseUrl: `http://localhost:${port}` })
    const ctx = await protocol.setup()

    const res = await ctx.get('/test')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ message: 'hello' })
  })

  it('makes a real POST request with body', async () => {
    let receivedBody = ''
    let receivedContentType = ''

    const port = await startServer((req, res) => {
      receivedContentType = req.headers['content-type'] ?? ''
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        receivedBody = Buffer.concat(chunks).toString()
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ created: true }))
      })
    })

    const protocol = http({ baseUrl: `http://localhost:${port}` })
    const ctx = await protocol.setup()

    const res = await ctx.post('/items', { name: 'test' })
    expect(res.status).toBe(201)
    expect(receivedContentType).toBe('application/json')
    expect(JSON.parse(receivedBody)).toEqual({ name: 'test' })
  })

  it('sends default headers with every request', async () => {
    let receivedAuth = ''

    const port = await startServer((req, res) => {
      receivedAuth = req.headers['authorization'] ?? ''
      res.writeHead(200)
      res.end('ok')
    })

    const protocol = http({
      baseUrl: `http://localhost:${port}`,
      defaultHeaders: { Authorization: 'Bearer test-token' },
    })
    const ctx = await protocol.setup()

    await ctx.get('/secure')
    expect(receivedAuth).toBe('Bearer test-token')
  })

  it('times out when server does not respond within timeout', async () => {
    const port = await startServer((_req, _res) => {
      // Intentionally never respond
    })

    const protocol = http({
      baseUrl: `http://localhost:${port}`,
      timeout: 100, // 100ms timeout
    })
    const ctx = await protocol.setup()

    await expect(ctx.get('/slow')).rejects.toThrow()
  })

  it('completes fast requests within the timeout window', async () => {
    const port = await startServer((_req, res) => {
      res.writeHead(200)
      res.end('fast')
    })

    const protocol = http({
      baseUrl: `http://localhost:${port}`,
      timeout: 5000,
    })
    const ctx = await protocol.setup()

    const res = await ctx.get('/fast')
    expect(res.status).toBe(200)
  })

  it('wraps network errors with fetch URL context', async () => {
    // Use a port that is definitely not listening
    const protocol = http({ baseUrl: 'http://localhost:1' })
    const ctx = await protocol.setup()

    await expect(ctx.get('/api/items')).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof Error &&
        err.message.includes('fetch to http://localhost:1/api/items failed') &&
        err.cause instanceof Error
      )
    })
  })

  it('wraps timeout errors with fetch URL context', async () => {
    const port = await startServer((_req, _res) => {
      // Intentionally never respond
    })

    const protocol = http({
      baseUrl: `http://localhost:${port}`,
      timeout: 50,
    })
    const ctx = await protocol.setup()

    await expect(ctx.get('/slow')).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof Error &&
        err.message.includes(`fetch to http://localhost:${port}/slow failed`) &&
        err.cause instanceof Error
      )
    })
  })

  it('withAction wraps fetch errors with action name and URL context', async () => {
    const port = await startServer((_req, _res) => {
      // Never respond — triggers timeout
    })

    const protocol = http({
      baseUrl: `http://localhost:${port}`,
      timeout: 50,
    })
    const ctx = await protocol.setup()
    const wrapped = withAction('load cart', ctx)

    await expect(wrapped.get('/api/cart')).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof Error &&
        err.message.startsWith('Action "load cart" failed:') &&
        err.message.includes(`fetch to http://localhost:${port}/api/cart failed`) &&
        err.cause instanceof Error
      )
    })
  })

  it('supports all HTTP methods', async () => {
    const methods: string[] = []

    const port = await startServer((req, res) => {
      methods.push(req.method!)
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ method: req.method }))
      })
    })

    const protocol = http({ baseUrl: `http://localhost:${port}` })
    const ctx = await protocol.setup()

    await ctx.get('/a')
    await ctx.post('/b', { x: 1 })
    await ctx.put('/c', { x: 2 })
    await ctx.patch('/d', { x: 3 })
    await ctx.delete('/e')

    expect(methods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
  })
})
