import { describe, it, expect } from 'vitest'
import { defineDomain, action, query, assertion } from '@aver/core'
import { generateSchema } from '../../src/schema'

describe('generateSchema()', () => {
  it('generates schema from domain with correct domain name', () => {
    const domain = defineDomain({
      name: 'MyDomain',
      actions: { createItem: action<{ name: string }>() },
      queries: { getItem: query<{ id: string }, string>() },
      assertions: { itemExists: assertion<{ id: string }>() },
    })

    const schema = generateSchema(domain)

    expect(schema.domain).toBe('MyDomain')
  })

  it('lists all operations with correct kinds', () => {
    const domain = defineDomain({
      name: 'FullDomain',
      actions: {
        doA: action<void>(),
        doB: action<{ x: number }>(),
      },
      queries: {
        getX: query<void, number>(),
      },
      assertions: {
        checkY: assertion<void>(),
        checkZ: assertion<{ val: string }>(),
      },
    })

    const schema = generateSchema(domain)

    expect(schema.operations).toEqual([
      { name: 'doA', kind: 'action' },
      { name: 'doB', kind: 'action' },
      { name: 'getX', kind: 'query' },
      { name: 'checkY', kind: 'assertion' },
      { name: 'checkZ', kind: 'assertion' },
    ])
  })

  it('handles empty domain (no operations)', () => {
    const domain = defineDomain({
      name: 'EmptyDomain',
      actions: {},
      queries: {},
      assertions: {},
    })

    const schema = generateSchema(domain)

    expect(schema.domain).toBe('EmptyDomain')
    expect(schema.operations).toEqual([])
  })
})
