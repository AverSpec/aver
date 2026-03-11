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
  getAdapters,
  resetRegistry,
  // Internals re-exported from main entry for backward compat
  registerDomain,
  registerAdapter,
  getDomains,
  getDomain,
  findAdapter,
  findAdapters,
  getGlobalTest,
  getGlobalDescribe,
} from '../src/index'

// Also verify the internals subpath entry
import {
  registerDomain as intRegisterDomain,
  registerAdapter as intRegisterAdapter,
  getDomains as intGetDomains,
  getDomain as intGetDomain,
  getAdapters as intGetAdapters,
  findAdapter as intFindAdapter,
  findAdapters as intFindAdapters,
  resetRegistry as intResetRegistry,
  getGlobalTest as intGetGlobalTest,
  getGlobalDescribe as intGetGlobalDescribe,
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

  it('exports registry internals from main entry', () => {
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

  it('exports the same functions via internals entry', () => {
    expect(intRegisterDomain).toBe(registerDomain)
    expect(intRegisterAdapter).toBe(registerAdapter)
    expect(intGetDomains).toBe(getDomains)
    expect(intGetDomain).toBe(getDomain)
    expect(intGetAdapters).toBe(getAdapters)
    expect(intFindAdapter).toBe(findAdapter)
    expect(intFindAdapters).toBe(findAdapters)
    expect(intResetRegistry).toBe(resetRegistry)
    expect(intGetGlobalTest).toBe(getGlobalTest)
    expect(intGetGlobalDescribe).toBe(getGlobalDescribe)
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
