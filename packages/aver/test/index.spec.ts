import { describe, it, expect, beforeEach } from 'vitest'
import {
  defineDomain,
  action,
  query,
  assertion,
  implement,
  suite,
  defineConfig,
  direct,
  getAdapters,
  resetRegistry,
} from '../src/index'

describe('public API', () => {
  it('exports all core functions', () => {
    expect(typeof defineDomain).toBe('function')
    expect(typeof action).toBe('function')
    expect(typeof query).toBe('function')
    expect(typeof assertion).toBe('function')
    expect(typeof implement).toBe('function')
    expect(typeof suite).toBe('function')
    expect(typeof defineConfig).toBe('function')
    expect(typeof direct).toBe('function')
  })
})

describe('defineConfig()', () => {
  beforeEach(() => {
    resetRegistry()
  })

  it('creates a config with adapters and testDir', () => {
    const config = defineConfig({
      testDir: './tests/acceptance',
      adapters: [],
    })
    expect(config.testDir).toBe('./tests/acceptance')
    expect(config.adapters).toEqual([])
  })

  it('defaults testDir', () => {
    const config = defineConfig({ adapters: [] })
    expect(config.testDir).toBe('./tests/acceptance')
  })

  it('auto-registers adapters', () => {
    const dom = defineDomain({
      name: 'ConfigTest',
      actions: {},
      queries: {},
      assertions: {},
    })
    const adapter = implement(dom, {
      protocol: direct(() => null),
      actions: {},
      queries: {},
      assertions: {},
    })

    defineConfig({ adapters: [adapter] })

    expect(getAdapters()).toHaveLength(1)
    expect(getAdapters()[0].domain.name).toBe('ConfigTest')
  })
})
