import { describe, it, expect, vi, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { memorySource } from '../../src/sources/memory.js'
import { fileSource } from '../../src/sources/file.js'
import { otelQuerySource } from '../../src/sources/otel-query.js'
import type { TelemetryEvent } from '../../src/types.js'

function makeEvent(overrides: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    schemaVersion: '1.0.0',
    domain: 'TestDomain',
    operation: 'doWork',
    kind: 'action',
    payload: {},
    timestamp: '2026-02-23T00:00:00Z',
    correlationId: 'test-correlation',
    environment: 'production',
    ...overrides,
  }
}

describe('memorySource', () => {
  it('returns provided events', async () => {
    const events = [makeEvent(), makeEvent({ operation: 'other' })]
    const source = memorySource(events)
    const loaded = await source.load()

    expect(loaded).toEqual(events)
    expect(loaded).toHaveLength(2)
  })

  it('returns a copy, not the original array', async () => {
    const events = [makeEvent()]
    const source = memorySource(events)
    const loaded = await source.load()

    loaded.push(makeEvent({ operation: 'extra' }))
    const loadedAgain = await source.load()
    expect(loadedAgain).toHaveLength(1)
  })

  it('returns empty array when initialized with empty', async () => {
    const source = memorySource([])
    const loaded = await source.load()
    expect(loaded).toEqual([])
  })
})

describe('fileSource', () => {
  it('parses JSONL format line-by-line', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aver-reconcile-test-'))
    const filePath = join(dir, 'events.jsonl')
    const events = [
      makeEvent({ operation: 'op1' }),
      makeEvent({ operation: 'op2' }),
      makeEvent({ operation: 'op3' }),
    ]
    const content = events.map(e => JSON.stringify(e)).join('\n')
    writeFileSync(filePath, content, 'utf-8')

    const source = fileSource(filePath)
    const loaded = await source.load()

    expect(loaded).toHaveLength(3)
    expect(loaded[0].operation).toBe('op1')
    expect(loaded[1].operation).toBe('op2')
    expect(loaded[2].operation).toBe('op3')
  })

  it('parses JSON array format', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aver-reconcile-test-'))
    const filePath = join(dir, 'events.json')
    const events = [
      makeEvent({ operation: 'op1' }),
      makeEvent({ operation: 'op2' }),
    ]
    writeFileSync(filePath, JSON.stringify(events), 'utf-8')

    const source = fileSource(filePath)
    const loaded = await source.load()

    expect(loaded).toHaveLength(2)
    expect(loaded[0].operation).toBe('op1')
    expect(loaded[1].operation).toBe('op2')
  })

  it('handles JSONL with trailing newline', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aver-reconcile-test-'))
    const filePath = join(dir, 'events.jsonl')
    const events = [makeEvent({ operation: 'op1' })]
    const content = events.map(e => JSON.stringify(e)).join('\n') + '\n'
    writeFileSync(filePath, content, 'utf-8')

    const source = fileSource(filePath)
    const loaded = await source.load()

    expect(loaded).toHaveLength(1)
    expect(loaded[0].operation).toBe('op1')
  })

  it('handles empty JSON array file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aver-reconcile-test-'))
    const filePath = join(dir, 'empty.json')
    writeFileSync(filePath, '[]', 'utf-8')

    const source = fileSource(filePath)
    const loaded = await source.load()

    expect(loaded).toEqual([])
  })
})

describe('otelQuerySource', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches events from an HTTP endpoint', async () => {
    const events = [makeEvent({ operation: 'op1' }), makeEvent({ operation: 'op2' })]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(events),
    }))

    const source = otelQuerySource({ endpoint: 'https://tempo.example.com/api/events' })
    const loaded = await source.load()

    expect(loaded).toEqual(events)
    expect(fetch).toHaveBeenCalledWith(
      'https://tempo.example.com/api/events',
      { headers: undefined },
    )
  })

  it('passes query parameters to the URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    }))

    const source = otelQuerySource({
      endpoint: 'https://tempo.example.com/api/events',
      query: { service: 'my-app', limit: '100' },
    })
    await source.load()

    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain('service=my-app')
    expect(calledUrl).toContain('limit=100')
  })

  it('passes custom headers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    }))

    const source = otelQuerySource({
      endpoint: 'https://tempo.example.com/api/events',
      headers: { Authorization: 'Bearer token123' },
    })
    await source.load()

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      { headers: { Authorization: 'Bearer token123' } },
    )
  })

  it('applies mapResponse to transform backend-specific data', async () => {
    const backendResponse = {
      traces: [
        { traceId: 't1', name: 'createOrder', spanKind: 'action', attributes: { env: 'prod' } },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(backendResponse),
    }))

    const source = otelQuerySource({
      endpoint: 'https://tempo.example.com/api/events',
      mapResponse: (data: unknown) => {
        const resp = data as { traces: Array<{ name: string; spanKind: string }> }
        return resp.traces.map(t => makeEvent({ operation: t.name, kind: t.spanKind as 'action' }))
      },
    })
    const loaded = await source.load()

    expect(loaded).toHaveLength(1)
    expect(loaded[0].operation).toBe('createOrder')
  })

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    }))

    const source = otelQuerySource({ endpoint: 'https://tempo.example.com/api/events' })

    await expect(source.load()).rejects.toThrow('OTel query failed: 503 Service Unavailable')
  })
})
