import { describe, it, expect } from 'vitest'
import { parseRunArgs } from '../../src/cli/run'

describe('parseRunArgs()', () => {
  it('parses --adapter flag', () => {
    const args = parseRunArgs(['--adapter', 'playwright'])
    expect(args.adapter).toBe('playwright')
  })

  it('parses --domain flag', () => {
    const args = parseRunArgs(['--domain', 'ShoppingCart'])
    expect(args.domain).toBe('ShoppingCart')
  })

  it('parses --watch flag', () => {
    const args = parseRunArgs(['--watch'])
    expect(args.watch).toBe(true)
  })

  it('parses positional file paths into passthroughArgs', () => {
    const args = parseRunArgs(['tests/my-test.spec.ts', '--adapter', 'playwright'])
    expect(args.passthroughArgs).toEqual(['tests/my-test.spec.ts'])
    expect(args.adapter).toBe('playwright')
  })

  it('defaults all flags to undefined/false', () => {
    const args = parseRunArgs([])
    expect(args.adapter).toBeUndefined()
    expect(args.domain).toBeUndefined()
    expect(args.watch).toBe(false)
    expect(args.passthroughArgs).toEqual([])
  })

  it('forwards unknown flags with = syntax', () => {
    const args = parseRunArgs(['--reporter=json', '--adapter', 'unit'])
    expect(args.passthroughArgs).toEqual(['--reporter=json'])
    expect(args.adapter).toBe('unit')
  })

  it('forwards unknown flags with separate value', () => {
    const args = parseRunArgs(['--config', 'custom.config.ts'])
    expect(args.passthroughArgs).toEqual(['--config', 'custom.config.ts'])
  })

  it('parses --adapter=value equals syntax', () => {
    const args = parseRunArgs(['--adapter=playwright'])
    expect(args.adapter).toBe('playwright')
    expect(args.passthroughArgs).toEqual([])
  })

  it('parses --domain=value equals syntax', () => {
    const args = parseRunArgs(['--domain=Cart'])
    expect(args.domain).toBe('Cart')
    expect(args.passthroughArgs).toEqual([])
  })

  it('throws when --adapter is at end of argv with no value', () => {
    expect(() => parseRunArgs(['--adapter'])).toThrow('--adapter requires a value')
  })

  it('throws when --domain is at end of argv with no value', () => {
    expect(() => parseRunArgs(['--domain'])).toThrow('--domain requires a value')
  })

  it('forwards mixed aver flags, vitest flags, and positionals', () => {
    const args = parseRunArgs([
      '--adapter', 'playwright',
      '--reporter=verbose',
      'tests/cart.spec.ts',
      '--domain', 'ShoppingCart',
      '--bail', '1',
      '--watch',
    ])
    expect(args.adapter).toBe('playwright')
    expect(args.domain).toBe('ShoppingCart')
    expect(args.watch).toBe(true)
    expect(args.passthroughArgs).toEqual([
      '--reporter=verbose',
      'tests/cart.spec.ts',
      '--bail',
      '1',
    ])
  })
})
