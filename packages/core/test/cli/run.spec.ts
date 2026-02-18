import { describe, it, expect } from 'vitest'
import { parseRunArgs, buildVitestArgs, buildRunEnv } from '../../src/cli/run'

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

describe('buildVitestArgs()', () => {
  it('builds run command by default', () => {
    expect(buildVitestArgs(false, [])).toEqual(['run'])
  })

  it('builds watch command when watch is true', () => {
    expect(buildVitestArgs(true, [])).toEqual(['watch'])
  })

  it('appends passthrough args', () => {
    expect(buildVitestArgs(false, ['--reporter=json', 'tests/cart.spec.ts'])).toEqual([
      'run', '--reporter=json', 'tests/cart.spec.ts',
    ])
  })
})

describe('buildRunEnv()', () => {
  it('sets AVER_ADAPTER when adapter is specified', () => {
    const env = buildRunEnv({ adapter: 'playwright', watch: false, passthroughArgs: [] }, {})
    expect(env.AVER_ADAPTER).toBe('playwright')
  })

  it('sets AVER_DOMAIN when domain is specified', () => {
    const env = buildRunEnv({ domain: 'Cart', watch: false, passthroughArgs: [] }, {})
    expect(env.AVER_DOMAIN).toBe('Cart')
  })

  it('sets AVER_AUTOLOAD_CONFIG when not already set', () => {
    const env = buildRunEnv({ watch: false, passthroughArgs: [] }, {})
    expect(env.AVER_AUTOLOAD_CONFIG).toBe('true')
  })

  it('does not override existing AVER_AUTOLOAD_CONFIG', () => {
    const env = buildRunEnv({ watch: false, passthroughArgs: [] }, { AVER_AUTOLOAD_CONFIG: 'false' })
    expect(env.AVER_AUTOLOAD_CONFIG).toBeUndefined()
  })

  it('omits unspecified flags', () => {
    const env = buildRunEnv({ watch: false, passthroughArgs: [] }, {})
    expect(env.AVER_ADAPTER).toBeUndefined()
    expect(env.AVER_DOMAIN).toBeUndefined()
  })
})
