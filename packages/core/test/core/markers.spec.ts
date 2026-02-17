import { describe, it, expect } from 'vitest'
import { action, query, assertion } from '../../src/core/markers'

describe('action()', () => {
  it('creates an action marker with no payload', () => {
    const marker = action()
    expect(marker).toEqual({ kind: 'action' })
  })

  it('creates an action marker (typed payload is compile-time only)', () => {
    const marker = action<{ name: string; qty: number }>()
    expect(marker).toEqual({ kind: 'action' })
  })
})

describe('query()', () => {
  it('creates a query marker', () => {
    const marker = query<number>()
    expect(marker).toEqual({ kind: 'query' })
  })
})

describe('assertion()', () => {
  it('creates an assertion marker with no payload', () => {
    const marker = assertion()
    expect(marker).toEqual({ kind: 'assertion' })
  })

  it('creates an assertion marker (typed payload is compile-time only)', () => {
    const marker = assertion<{ amount: number }>()
    expect(marker).toEqual({ kind: 'assertion' })
  })
})
