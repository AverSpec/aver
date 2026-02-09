import { describe, it, expect } from 'vitest'
import { playwright } from '../src/index'

describe('playwright()', () => {
  it('creates a protocol with name "playwright"', () => {
    const protocol = playwright()
    expect(protocol.name).toBe('playwright')
    expect(typeof protocol.setup).toBe('function')
    expect(typeof protocol.teardown).toBe('function')
  })

  it('accepts launch options', () => {
    const protocol = playwright({ headless: true })
    expect(protocol.name).toBe('playwright')
  })
})
