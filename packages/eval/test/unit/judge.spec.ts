import { describe, it, expect } from 'vitest'
import { VerdictSchema } from '../../src/judge'

describe('VerdictSchema', () => {
  it('parses a valid pass verdict', () => {
    const result = VerdictSchema.parse({ pass: true, reasoning: 'Output meets all criteria.' })
    expect(result.pass).toBe(true)
    expect(result.reasoning).toBe('Output meets all criteria.')
  })

  it('parses a valid fail verdict', () => {
    const result = VerdictSchema.parse({ pass: false, reasoning: 'Missing domain references.' })
    expect(result.pass).toBe(false)
  })

  it('rejects empty reasoning', () => {
    expect(() => VerdictSchema.parse({ pass: true, reasoning: '' })).toThrow()
  })

  it('rejects missing fields', () => {
    expect(() => VerdictSchema.parse({ pass: true })).toThrow()
    expect(() => VerdictSchema.parse({ reasoning: 'ok' })).toThrow()
  })
})
