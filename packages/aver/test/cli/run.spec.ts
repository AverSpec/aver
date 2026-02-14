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

  it('parses positional file paths', () => {
    const args = parseRunArgs(['tests/my-test.spec.ts', '--adapter', 'playwright'])
    expect(args.positionals).toEqual(['tests/my-test.spec.ts'])
    expect(args.adapter).toBe('playwright')
  })

  it('defaults all flags to undefined/false', () => {
    const args = parseRunArgs([])
    expect(args.adapter).toBeUndefined()
    expect(args.domain).toBeUndefined()
    expect(args.watch).toBe(false)
    expect(args.positionals).toEqual([])
  })
})
