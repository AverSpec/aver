import { describe, it, expect } from 'vitest'
import { removalOperator } from '../../src/operators/removal'
import { returnValueOperator } from '../../src/operators/return-value'
import { throwErrorOperator } from '../../src/operators/throw-error'
import { defaultOperators } from '../../src/operators/index'

describe('removalOperator', () => {
  it('returns an operator named removal targeting all handlers', () => {
    const op = removalOperator()
    expect(op.name).toBe('removal')
    expect(op.targets).toBe('all')
  })

  it('mutate returns a function that resolves to undefined', async () => {
    const op = removalOperator()
    const original = async () => 'original value'
    const mutated = op.mutate('myHandler', original)

    expect(mutated).toBeTypeOf('function')
    const result = await mutated!()
    expect(result).toBeUndefined()
  })
})

describe('returnValueOperator', () => {
  it('returns an operator named return-value targeting queries', () => {
    const op = returnValueOperator(null)
    expect(op.name).toBe('return-value(null)')
    expect(op.targets).toBe('queries')
  })

  it('includes replacement value in operator name', () => {
    expect(returnValueOperator(null).name).toBe('return-value(null)')
    expect(returnValueOperator('').name).toBe('return-value("")')
    expect(returnValueOperator(0).name).toBe('return-value(0)')
  })

  it('with null: returned function resolves to null', async () => {
    const op = returnValueOperator(null)
    const original = async () => 'something'
    const mutated = op.mutate('getItems', original)

    expect(mutated).toBeTypeOf('function')
    const result = await mutated!()
    expect(result).toBeNull()
  })

  it('with empty string: returned function resolves to empty string', async () => {
    const op = returnValueOperator('')
    const original = async () => 'something'
    const mutated = op.mutate('getItems', original)

    expect(mutated).toBeTypeOf('function')
    const result = await mutated!()
    expect(result).toBe('')
  })

  it('with default (no argument): returned function resolves to null', async () => {
    const op = returnValueOperator()
    const mutated = op.mutate('getItems', async () => 42)

    const result = await mutated!()
    expect(result).toBeNull()
  })
})

describe('throwErrorOperator', () => {
  it('returns an operator named throw-error targeting all handlers', () => {
    const op = throwErrorOperator()
    expect(op.name).toBe('throw-error')
    expect(op.targets).toBe('all')
  })

  it('returned function throws an error', async () => {
    const op = throwErrorOperator()
    const original = async () => 'value'
    const mutated = op.mutate('doWork', original)

    expect(mutated).toBeTypeOf('function')
    await expect(mutated!()).rejects.toThrow('Mutation: simulated error')
  })
})

describe('defaultOperators', () => {
  it('returns 5 operators', () => {
    const ops = defaultOperators()
    expect(ops).toHaveLength(5)
  })

  it('includes removal, return-value, and throw-error operators', () => {
    const ops = defaultOperators()
    const names = ops.map(op => op.name)

    expect(names).toContain('removal')
    expect(names.some(n => n.startsWith('return-value'))).toBe(true)
    expect(names).toContain('throw-error')
  })

  it('has three return-value variants', () => {
    const ops = defaultOperators()
    const returnValueOps = ops.filter(op => op.name.startsWith('return-value'))
    expect(returnValueOps).toHaveLength(3)
  })
})
