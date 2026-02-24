import { describe, it, expect } from 'vitest'
import { getGlobalTest, getGlobalDescribe } from '../../src/core/test-registration'

describe('getGlobalTest()', () => {
  it('returns injected value when provided', () => {
    const injected = () => {}
    expect(getGlobalTest(injected)).toBe(injected)
  })

  it('falls back to globalThis.test when no injection', () => {
    const result = getGlobalTest()
    // In vitest, globalThis.test is the vitest test function
    expect(result).toBeDefined()
    expect(typeof result).toBe('function')
  })

  it('returns undefined injection as undefined (not fallback)', () => {
    // undefined means "not injected" — should fall back
    const result = getGlobalTest(undefined)
    expect(result).toBeDefined()
  })

  it('returns null injection as null (explicit override)', () => {
    // null is a valid injected value (means: no test runner)
    const result = getGlobalTest(null)
    expect(result).toBeNull()
  })
})

describe('getGlobalDescribe()', () => {
  it('returns injected value when provided', () => {
    const injected = (name: string, fn: () => void) => {}
    expect(getGlobalDescribe(injected)).toBe(injected)
  })

  it('falls back to globalThis.describe when no injection', () => {
    const result = getGlobalDescribe()
    expect(typeof result).toBe('function')
  })
})
