import { describe, it, expect, beforeEach } from 'vitest'
import {
  defineDomain,
  action,
  query,
  assertion,
  implement,
  suite,
  defineConfig,
  unit,
} from '../src/index'

// Internals are only available via the internals subpath entry
import {
  registerDomain,
  registerAdapter,
  getDomains,
  getDomain,
  getAdapters,
  findAdapter,
  findAdapters,
  resetRegistry,
  getGlobalTest,
  getGlobalDescribe,
} from '../src/internals'

describe('public API', () => {
  it('exports all core functions', () => {
    expect(typeof defineDomain).toBe('function')
    expect(typeof action).toBe('function')
    expect(typeof query).toBe('function')
    expect(typeof assertion).toBe('function')
    expect(typeof implement).toBe('function')
    expect(typeof suite).toBe('function')
    expect(typeof defineConfig).toBe('function')
    expect(typeof unit).toBe('function')
  })

  it('exports registry internals from internals entry', () => {
    expect(typeof registerDomain).toBe('function')
    expect(typeof registerAdapter).toBe('function')
    expect(typeof getDomains).toBe('function')
    expect(typeof getDomain).toBe('function')
    expect(typeof getAdapters).toBe('function')
    expect(typeof findAdapter).toBe('function')
    expect(typeof findAdapters).toBe('function')
    expect(typeof resetRegistry).toBe('function')
    expect(typeof getGlobalTest).toBe('function')
    expect(typeof getGlobalDescribe).toBe('function')
  })
})

describe('defineConfig()', () => {
  beforeEach(() => {
    resetRegistry()
  })

  it('creates a config with adapters', () => {
    const config = defineConfig({
      adapters: [],
    })
    expect(config.adapters).toEqual([])
  })

  it('auto-registers adapters', () => {
    const dom = defineDomain({
      name: 'ConfigTest',
      actions: {},
      queries: {},
      assertions: {},
    })
    const adapter = implement(dom, {
      protocol: unit(() => null),
      actions: {},
      queries: {},
      assertions: {},
    })

    defineConfig({ adapters: [adapter] })

    expect(getAdapters()).toHaveLength(1)
    expect(getAdapters()[0].domain.name).toBe('ConfigTest')
  })
})
