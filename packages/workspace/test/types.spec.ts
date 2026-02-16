import { describe, it, expect } from 'vitest'
import { createItem, createExample, type WorkspaceItem } from '../src/types'

describe('WorkspaceItem', () => {
  it('creates an observation with generated id', () => {
    const item = createItem({
      stage: 'observed',
      behavior: 'POST /orders with empty cart returns 200 with error field'
    })

    expect(item.id).toMatch(/^[a-f0-9]{8}$/)
    expect(item.stage).toBe('observed')
    expect(item.behavior).toBe('POST /orders with empty cart returns 200 with error field')
    expect(item.createdAt).toBeTypeOf('string')
    expect(item.questions).toEqual([])
    expect(item.rules).toEqual([])
    expect(item.examples).toEqual([])
    expect(item.constraints).toEqual([])
    expect(item.seams).toEqual([])
  })

  it('creates an intent with story', () => {
    const item = createItem({
      stage: 'intended',
      behavior: 'Users can cancel pending orders',
      story: 'Cancel Order'
    })

    expect(item.stage).toBe('intended')
    expect(item.story).toBe('Cancel Order')
  })

  it('creates unique ids across items', () => {
    const a = createItem({ stage: 'observed', behavior: 'a' })
    const b = createItem({ stage: 'observed', behavior: 'b' })
    expect(a.id).not.toBe(b.id)
  })
})

describe('Example', () => {
  it('creates an example with description and expected outcome', () => {
    const ex = createExample({
      description: 'cancel pending order',
      expectedOutcome: 'order status becomes cancelled'
    })

    expect(ex.description).toBe('cancel pending order')
    expect(ex.expectedOutcome).toBe('order status becomes cancelled')
  })
})
