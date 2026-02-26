import { describe, it, expect } from 'vitest'
import { estimateTokens } from '../../src/db/tokens'

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('returns 0 for undefined-ish input', () => {
    expect(estimateTokens(undefined as unknown as string)).toBe(0)
  })

  it('estimates tokens as chars / 4 rounded up', () => {
    // 10 chars → ceil(10/4) = 3
    expect(estimateTokens('0123456789')).toBe(3)
  })

  it('returns 1 for single character', () => {
    expect(estimateTokens('a')).toBe(1)
  })

  it('gives reasonable estimate for English text', () => {
    const text = 'The quick brown fox jumps over the lazy dog' // 43 chars
    const estimate = estimateTokens(text)
    // Real tokenizers give ~9-10 tokens for this. chars/4 = 11. Within 20%.
    expect(estimate).toBeGreaterThan(5)
    expect(estimate).toBeLessThan(20)
  })
})
