import { describe, it, expect, afterEach } from 'vitest'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FileTraceSource } from '../src/trace-source'

let tmpDir: string

async function writeTmpFile(name: string, content: string): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'aver-trace-source-'))
  const filePath = join(tmpDir, name)
  await writeFile(filePath, content)
  return filePath
}

afterEach(async () => {
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true })
  }
})

describe('FileTraceSource', () => {
  it('returns a single trace with 3 spans from valid OTLP JSON', async () => {
    const otlp = {
      resourceSpans: [{
        scopeSpans: [{
          spans: [
            {
              traceId: 'abc123',
              spanId: 'span-1',
              parentSpanId: '',
              name: 'HTTP GET /users',
              attributes: [
                { key: 'http.method', value: { stringValue: 'GET' } },
              ],
            },
            {
              traceId: 'abc123',
              spanId: 'span-2',
              parentSpanId: 'span-1',
              name: 'db.query',
              attributes: [
                { key: 'db.statement', value: { stringValue: 'SELECT * FROM users' } },
              ],
            },
            {
              traceId: 'abc123',
              spanId: 'span-3',
              parentSpanId: 'span-1',
              name: 'serialize',
              attributes: [],
            },
          ],
        }],
      }],
    }

    const filePath = await writeTmpFile('traces.json', JSON.stringify(otlp))
    const source = new FileTraceSource(filePath)
    const traces = await source.fetch()

    expect(traces).toHaveLength(1)
    expect(traces[0].traceId).toBe('abc123')
    expect(traces[0].spans).toHaveLength(3)
    expect(traces[0].spans[0]).toMatchObject({
      name: 'HTTP GET /users',
      spanId: 'span-1',
      parentSpanId: undefined,
      attributes: { 'http.method': 'GET' },
    })
    expect(traces[0].spans[1]).toMatchObject({
      name: 'db.query',
      spanId: 'span-2',
      parentSpanId: 'span-1',
    })
    expect(traces[0].spans[2]).toMatchObject({
      name: 'serialize',
      spanId: 'span-3',
      parentSpanId: 'span-1',
    })
  })

  it('groups spans from different traceIds into separate traces', async () => {
    const otlp = {
      resourceSpans: [{
        scopeSpans: [{
          spans: [
            { traceId: 'trace-a', spanId: 's1', parentSpanId: '', name: 'span-a1', attributes: [] },
            { traceId: 'trace-b', spanId: 's2', parentSpanId: '', name: 'span-b1', attributes: [] },
            { traceId: 'trace-a', spanId: 's3', parentSpanId: 's1', name: 'span-a2', attributes: [] },
          ],
        }],
      }],
    }

    const filePath = await writeTmpFile('multi.json', JSON.stringify(otlp))
    const source = new FileTraceSource(filePath)
    const traces = await source.fetch()

    expect(traces).toHaveLength(2)
    const traceA = traces.find(t => t.traceId === 'trace-a')!
    const traceB = traces.find(t => t.traceId === 'trace-b')!
    expect(traceA.spans).toHaveLength(2)
    expect(traceB.spans).toHaveLength(1)
  })

  it('converts all OTLP attribute value types correctly', async () => {
    const otlp = {
      resourceSpans: [{
        scopeSpans: [{
          spans: [{
            traceId: 't1',
            spanId: 's1',
            parentSpanId: '',
            name: 'typed-attrs',
            attributes: [
              { key: 'str', value: { stringValue: 'hello' } },
              { key: 'int', value: { intValue: '42' } },
              { key: 'bool', value: { boolValue: true } },
              { key: 'double', value: { doubleValue: 3.14 } },
            ],
          }],
        }],
      }],
    }

    const filePath = await writeTmpFile('attrs.json', JSON.stringify(otlp))
    const source = new FileTraceSource(filePath)
    const traces = await source.fetch()

    const attrs = traces[0].spans[0].attributes
    expect(attrs['str']).toBe('hello')
    expect(attrs['int']).toBe(42)
    expect(attrs['bool']).toBe(true)
    expect(attrs['double']).toBe(3.14)
  })

  it('throws with file path when file does not exist', async () => {
    const source = new FileTraceSource('/nonexistent/path/traces.json')
    await expect(source.fetch()).rejects.toThrow('/nonexistent/path/traces.json')
  })

  it('throws with parse context for invalid JSON', async () => {
    const filePath = await writeTmpFile('bad.json', '{ not valid json }}}')
    const source = new FileTraceSource(filePath)
    await expect(source.fetch()).rejects.toThrow(/parse|JSON/i)
  })

  it('returns empty array for empty resourceSpans', async () => {
    const filePath = await writeTmpFile('empty.json', JSON.stringify({ resourceSpans: [] }))
    const source = new FileTraceSource(filePath)
    const traces = await source.fetch()
    expect(traces).toEqual([])
  })

  it('normalizes parentSpanId sentinel "0000000000000000" to undefined', async () => {
    const otlp = {
      resourceSpans: [{
        scopeSpans: [{
          spans: [{
            traceId: 't1',
            spanId: 's1',
            parentSpanId: '0000000000000000',
            name: 'root-span',
            attributes: [],
          }],
        }],
      }],
    }

    const filePath = await writeTmpFile('sentinel.json', JSON.stringify(otlp))
    const source = new FileTraceSource(filePath)
    const traces = await source.fetch()

    expect(traces[0].spans[0].parentSpanId).toBeUndefined()
  })
})
