import { describe, it, expect } from 'vitest'
import { VerdictSchema } from '../../src/judge'
import { mockProvider } from '../../src/providers/mock'

describe('VerdictSchema', () => {
  it('parses a valid pass verdict', () => {
    const result = VerdictSchema.parse({ pass: true, reasoning: 'Output meets all criteria.', confidence: 'high' })
    expect(result.pass).toBe(true)
    expect(result.reasoning).toBe('Output meets all criteria.')
  })

  it('parses a valid fail verdict', () => {
    const result = VerdictSchema.parse({ pass: false, reasoning: 'Missing domain references.', confidence: 'medium' })
    expect(result.pass).toBe(false)
  })

  it('rejects empty reasoning', () => {
    expect(() => VerdictSchema.parse({ pass: true, reasoning: '', confidence: 'high' })).toThrow()
  })

  it('rejects missing fields', () => {
    expect(() => VerdictSchema.parse({ pass: true })).toThrow()
    expect(() => VerdictSchema.parse({ reasoning: 'ok' })).toThrow()
  })

  it('parses verdict with confidence field', () => {
    const result = VerdictSchema.parse({ pass: true, reasoning: 'Solid match.', confidence: 'high' })
    expect(result.confidence).toBe('high')
  })

  it('rejects verdict without confidence (required)', () => {
    expect(() => VerdictSchema.parse({ pass: true, reasoning: 'OK.' })).toThrow()
  })

  it('rejects invalid confidence value', () => {
    expect(() => VerdictSchema.parse({ pass: true, reasoning: 'OK.', confidence: 'maybe' })).toThrow()
  })

  it('accepts all valid confidence values', () => {
    for (const level of ['high', 'medium', 'low'] as const) {
      const result = VerdictSchema.parse({ pass: true, reasoning: 'OK.', confidence: level })
      expect(result.confidence).toBe(level)
    }
  })
})

describe('mockProvider', () => {
  it('returns a matching canned verdict', async () => {
    const provider = mockProvider([
      { match: 'cart operations', verdict: { pass: true, reasoning: 'References cart.', confidence: 'high' } },
    ])
    const result = await provider.judge('some content', 'References cart operations')
    expect(result.pass).toBe(true)
    expect(result.reasoning).toBe('References cart.')
  })

  it('returns fail when no match found', async () => {
    const provider = mockProvider([
      { match: 'cart', verdict: { pass: true, reasoning: 'ok', confidence: 'high' } },
    ])
    const result = await provider.judge('content', 'References inventory')
    expect(result.pass).toBe(false)
    expect(result.reasoning).toContain('No matching mock')
  })

  it('matches against rubric text', async () => {
    const provider = mockProvider([
      { match: 'hallucin', verdict: { pass: true, reasoning: 'No hallucinations found.', confidence: 'high' } },
    ])
    const result = await provider.judge('output text', 'Check for hallucinations in the output')
    expect(result.pass).toBe(true)
  })

  it('passes through confidence from canned verdict', async () => {
    const provider = mockProvider([
      { match: 'seams', verdict: { pass: true, reasoning: 'Found seams.', confidence: 'high' } },
    ])
    const result = await provider.judge('content', 'References seams')
    expect(result.pass).toBe(true)
    expect(result.confidence).toBe('high')
  })
})
