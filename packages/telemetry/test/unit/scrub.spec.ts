import { describe, it, expect } from 'vitest'
import { scrubPayload } from '../../src/scrub'

describe('scrubPayload()', () => {
  it('redacts specified fields with [REDACTED]', () => {
    const payload = { email: 'user@example.com', name: 'Alice', age: 30 }
    const result = scrubPayload(payload, ['email'])
    expect(result).toEqual({ email: '[REDACTED]', name: 'Alice', age: 30 })
  })

  it('leaves unspecified fields untouched', () => {
    const payload = { email: 'user@example.com', name: 'Alice' }
    const result = scrubPayload(payload, ['password'])
    expect(result).toEqual({ email: 'user@example.com', name: 'Alice' })
  })

  it('returns non-object payloads unchanged', () => {
    expect(scrubPayload('hello', ['field'])).toBe('hello')
    expect(scrubPayload(42, ['field'])).toBe(42)
    expect(scrubPayload(true, ['field'])).toBe(true)
  })

  it('returns null/undefined unchanged', () => {
    expect(scrubPayload(null, ['field'])).toBeNull()
    expect(scrubPayload(undefined, ['field'])).toBeUndefined()
  })

  it('handles empty scrub list (no-op)', () => {
    const payload = { email: 'user@example.com', name: 'Alice' }
    const result = scrubPayload(payload, [])
    expect(result).toEqual({ email: 'user@example.com', name: 'Alice' })
    // Should be the same reference since no scrubbing needed
    expect(result).toBe(payload)
  })
})
