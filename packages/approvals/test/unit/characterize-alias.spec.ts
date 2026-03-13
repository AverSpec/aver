import { describe, it, expect } from 'vitest'
import { approve, characterize } from '../../src/index'

describe('characterize() alias', () => {
  it('is the same function reference as approve()', () => {
    expect(characterize).toBe(approve)
  })

  it('has the visual method like approve', () => {
    expect(characterize.visual).toBe(approve.visual)
  })
})
