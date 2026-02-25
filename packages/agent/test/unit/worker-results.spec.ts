import { describe, it, expect } from 'vitest'
import { parseWorkerResult } from '../../src/worker/results.js'

describe('parseWorkerResult', () => {
  it('parses a complete result', () => {
    const text = '```json\n' + JSON.stringify({
      summary: 'Found 3 seams',
      artifacts: [{ type: 'investigation', name: 'auth', summary: 'auth inv', content: '...' }],
      filesChanged: ['src/auth.ts'],
      status: 'complete',
    }) + '\n```'
    const result = parseWorkerResult(text)
    expect(result.summary).toBe('Found 3 seams')
    expect(result.artifacts).toHaveLength(1)
    expect(result.status).toBe('complete')
  })

  it('parses a stuck result', () => {
    const text = JSON.stringify({ summary: 'Cannot proceed', artifacts: [], status: 'stuck' })
    const result = parseWorkerResult(text)
    expect(result.status).toBe('stuck')
  })

  it('defaults status to complete when missing', () => {
    const text = JSON.stringify({ summary: 'Done', artifacts: [] })
    const result = parseWorkerResult(text)
    expect(result.status).toBe('complete')
  })

  it('extracts JSON from surrounding text', () => {
    const text = 'I investigated the module.\n\n```json\n{"summary":"done","artifacts":[]}\n```\n\nThat covers it.'
    const result = parseWorkerResult(text)
    expect(result.summary).toBe('done')
  })

  it('filters out malformed artifacts', () => {
    const text = JSON.stringify({
      summary: 'done',
      artifacts: [
        42,
        null,
        'hello',
        { type: 'investigation' },
        { type: 'investigation', name: 'a', summary: 's', content: 'c' },
        { type: 1, name: 'b', summary: 's', content: 'c' },
      ],
    })
    const result = parseWorkerResult(text)
    expect(result.artifacts).toHaveLength(1)
    expect(result.artifacts[0].name).toBe('a')
  })

  it('throws on missing summary', () => {
    const text = JSON.stringify({ artifacts: [] })
    expect(() => parseWorkerResult(text)).toThrow()
  })
})
