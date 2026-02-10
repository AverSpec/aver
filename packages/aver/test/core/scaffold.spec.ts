import { describe, it, expect } from 'vitest'
import { toKebabCase } from '../../src/cli/scaffold'

describe('toKebabCase', () => {
  it('converts camelCase to kebab-case', () => {
    expect(toKebabCase('taskBoard')).toBe('task-board')
  })

  it('converts PascalCase to kebab-case', () => {
    expect(toKebabCase('TaskBoard')).toBe('task-board')
  })

  it('handles multiple words', () => {
    expect(toKebabCase('shoppingCartItem')).toBe('shopping-cart-item')
  })

  it('passes through already kebab-case', () => {
    expect(toKebabCase('task-board')).toBe('task-board')
  })

  it('handles single word', () => {
    expect(toKebabCase('task')).toBe('task')
  })
})
