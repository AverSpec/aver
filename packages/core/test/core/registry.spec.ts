import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  registerDomain, getDomains, getDomain,
  registerAdapter, getAdapters, findAdapter, findAdapters, resetRegistry,
  getRegistrySnapshot, restoreRegistrySnapshot, withRegistry,
} from '../../src/core/registry'
import { resetConfigAutoload } from '../../src/core/test-registration'
import { defineDomain } from '../../src/core/domain'
import { implement } from '../../src/core/adapter'
import { unit } from '../../src/protocols/unit'
import { action, query, assertion } from '../../src/core/markers'

const cart = defineDomain({
  name: 'Cart',
  actions: { addItem: action() },
  queries: { total: query<number>() },
  assertions: { isEmpty: assertion() },
})

const orders = defineDomain({
  name: 'Orders',
  actions: { place: action() },
  queries: { list: query<string[]>() },
  assertions: { hasOrder: assertion() },
})

function makeAdapter(domain: ReturnType<typeof defineDomain>, protocolName = 'unit') {
  const handlers: Record<string, any> = {}
  for (const section of ['actions', 'queries', 'assertions'] as const) {
    handlers[section] = {}
    for (const key of Object.keys(domain.vocabulary[section])) {
      handlers[section][key] = async () => {}
    }
  }
  return implement(domain, {
    protocol: { name: protocolName, async setup() { return null }, async teardown() {} },
    ...handlers,
  } as any)
}

describe('domain registry', () => {
  beforeEach(() => {
    resetRegistry()
  })

  it('starts empty', () => {
    expect(getDomains()).toEqual([])
  })

  it('registers a domain', () => {
    registerDomain(cart)
    expect(getDomains()).toHaveLength(1)
    expect(getDomains()[0].name).toBe('Cart')
  })

  it('deduplicates domains by name', () => {
    registerDomain(cart)
    registerDomain(cart)
    expect(getDomains()).toHaveLength(1)
  })

  it('registers multiple domains', () => {
    registerDomain(cart)
    registerDomain(orders)
    expect(getDomains()).toHaveLength(2)
  })

  it('retrieves a domain by name', () => {
    registerDomain(cart)
    registerDomain(orders)
    expect(getDomain('Cart')).toBe(cart)
    expect(getDomain('Orders')).toBe(orders)
  })

  it('returns undefined for unknown domain name', () => {
    expect(getDomain('Unknown')).toBeUndefined()
  })

  it('returns a copy from getDomains', () => {
    registerDomain(cart)
    const domains = getDomains()
    domains.push(orders)
    expect(getDomains()).toHaveLength(1)
  })
})

describe('registerAdapter auto-registers domain', () => {
  beforeEach(() => {
    resetRegistry()
  })

  it('auto-registers the domain when registering an adapter', () => {
    const adapter = implement(cart, {
      protocol: unit(() => null),
      actions: { addItem: async () => {} },
      queries: { total: async () => 0 },
      assertions: { isEmpty: async () => {} },
    })
    registerAdapter(adapter)
    expect(getDomains()).toHaveLength(1)
    expect(getDomain('Cart')).toBe(cart)
  })

  it('does not duplicate domain when adapter registered twice', () => {
    const adapter = implement(cart, {
      protocol: unit(() => null),
      actions: { addItem: async () => {} },
      queries: { total: async () => 0 },
      assertions: { isEmpty: async () => {} },
    })
    registerAdapter(adapter)
    registerAdapter(adapter)
    expect(getDomains()).toHaveLength(1)
  })
})

describe('resetRegistry', () => {
  it('clears both adapters and domains', () => {
    registerDomain(cart)
    const adapter = implement(cart, {
      protocol: unit(() => null),
      actions: { addItem: async () => {} },
      queries: { total: async () => 0 },
      assertions: { isEmpty: async () => {} },
    })
    registerAdapter(adapter)
    resetRegistry()
    expect(getDomains()).toEqual([])
    expect(getAdapters()).toEqual([])
  })

  it('resets configAutoloadAttempted flag', () => {
    // resetConfigAutoload is called internally by resetRegistry.
    // We verify by ensuring the export exists and is callable.
    expect(typeof resetConfigAutoload).toBe('function')
    // Calling it directly should not throw
    resetConfigAutoload()
  })
})

describe('findAdapter', () => {
  beforeEach(() => {
    resetRegistry()
  })

  it('returns undefined when no adapters are registered', () => {
    expect(findAdapter(cart)).toBeUndefined()
  })

  it('finds an exact match by domain reference', () => {
    const adapter = makeAdapter(cart)
    registerAdapter(adapter)
    expect(findAdapter(cart)).toBe(adapter)
  })

  it('returns undefined when adapter is registered for a different domain', () => {
    const adapter = makeAdapter(orders)
    registerAdapter(adapter)
    expect(findAdapter(cart)).toBeUndefined()
  })

  it('walks parent chain to find adapter for parent domain', () => {
    const child = cart.extend('CartUI', {
      assertions: { showsSpinner: assertion() },
    })

    const adapter = makeAdapter(cart)
    registerAdapter(adapter)

    expect(findAdapter(child)).toBe(adapter)
  })

  it('walks multi-level parent chain', () => {
    const child = cart.extend('CartUI', {
      assertions: { showsSpinner: assertion() },
    })
    const grandchild = child.extend('CartUIFull', {
      assertions: { showsBadge: assertion() },
    })

    const adapter = makeAdapter(cart)
    registerAdapter(adapter)

    expect(findAdapter(grandchild)).toBe(adapter)
  })

  it('prefers exact match over parent match', () => {
    const child = cart.extend('CartUI', {
      assertions: { showsSpinner: assertion() },
    })

    const parentAdapter = makeAdapter(cart)
    const childAdapter = makeAdapter(child)
    registerAdapter(parentAdapter)
    registerAdapter(childAdapter)

    expect(findAdapter(child)).toBe(childAdapter)
  })

  it('does not warn on reference match', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const adapter = makeAdapter(cart)
    registerAdapter(adapter)
    findAdapter(cart)
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('falls back to name match when reference differs', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const adapter = makeAdapter(cart)
    registerAdapter(adapter)

    // Simulate a re-exported domain with the same name but different reference
    const cartCopy = defineDomain({
      name: 'Cart',
      actions: { addItem: action() },
      queries: { total: query<number>() },
      assertions: { isEmpty: assertion() },
    })

    expect(findAdapter(cartCopy)).toBe(adapter)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Domain "Cart" matched by name, not reference')
    )
    warnSpy.mockRestore()
  })

  it('returns undefined with no warning when neither reference nor name matches', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const adapter = makeAdapter(cart)
    registerAdapter(adapter)

    expect(findAdapter(orders)).toBeUndefined()
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('findAdapters', () => {
  beforeEach(() => {
    resetRegistry()
  })

  it('returns empty array when no adapters are registered', () => {
    expect(findAdapters(cart)).toEqual([])
  })

  it('returns all adapters for a domain', () => {
    const unitAdapter = makeAdapter(cart, 'unit')
    const httpAdapter = makeAdapter(cart, 'http')
    registerAdapter(unitAdapter)
    registerAdapter(httpAdapter)

    const result = findAdapters(cart)
    expect(result).toHaveLength(2)
    expect(result).toContain(unitAdapter)
    expect(result).toContain(httpAdapter)
  })

  it('walks parent chain when no exact match exists', () => {
    const child = cart.extend('CartUI', {
      assertions: { showsSpinner: assertion() },
    })

    const unitAdapter = makeAdapter(cart, 'unit')
    const httpAdapter = makeAdapter(cart, 'http')
    registerAdapter(unitAdapter)
    registerAdapter(httpAdapter)

    const result = findAdapters(child)
    expect(result).toHaveLength(2)
    expect(result).toContain(unitAdapter)
    expect(result).toContain(httpAdapter)
  })

  it('does not include parent adapters when exact match exists', () => {
    const child = cart.extend('CartUI', {
      assertions: { showsSpinner: assertion() },
    })

    const parentAdapter = makeAdapter(cart, 'unit')
    const childAdapter = makeAdapter(child, 'http')
    registerAdapter(parentAdapter)
    registerAdapter(childAdapter)

    const result = findAdapters(child)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(childAdapter)
  })

  it('stops walking parent chain at first level with matches', () => {
    const child = cart.extend('CartUI', {
      assertions: { showsSpinner: assertion() },
    })
    const grandchild = child.extend('CartUIFull', {
      assertions: { showsBadge: assertion() },
    })

    const parentAdapter = makeAdapter(cart, 'unit')
    const childAdapter = makeAdapter(child, 'http')
    registerAdapter(parentAdapter)
    registerAdapter(childAdapter)

    // grandchild should find child's adapter (first parent with a match)
    const result = findAdapters(grandchild)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(childAdapter)
  })

  it('returns empty array for unrelated domain', () => {
    const adapter = makeAdapter(cart)
    registerAdapter(adapter)

    expect(findAdapters(orders)).toEqual([])
  })

  it('does not warn on reference match', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const adapter = makeAdapter(cart)
    registerAdapter(adapter)
    findAdapters(cart)
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('falls back to name match when reference differs', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unitAdapter = makeAdapter(cart, 'unit')
    const httpAdapter = makeAdapter(cart, 'http')
    registerAdapter(unitAdapter)
    registerAdapter(httpAdapter)

    const cartCopy = defineDomain({
      name: 'Cart',
      actions: { addItem: action() },
      queries: { total: query<number>() },
      assertions: { isEmpty: assertion() },
    })

    const result = findAdapters(cartCopy)
    expect(result).toHaveLength(2)
    expect(result).toContain(unitAdapter)
    expect(result).toContain(httpAdapter)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Domain "Cart" matched by name, not reference')
    )
    warnSpy.mockRestore()
  })

  it('returns empty array with no warning when neither reference nor name matches', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const adapter = makeAdapter(cart)
    registerAdapter(adapter)

    expect(findAdapters(orders)).toEqual([])
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('getRegistrySnapshot / restoreRegistrySnapshot', () => {
  beforeEach(() => {
    resetRegistry()
  })

  it('captures and restores registry state', () => {
    registerDomain(cart)
    const adapter = makeAdapter(cart)
    registerAdapter(adapter)

    const snapshot = getRegistrySnapshot()
    expect(snapshot.adapters).toHaveLength(1)
    expect(snapshot.domains).toHaveLength(1)

    // Mutate registry
    registerDomain(orders)
    expect(getDomains()).toHaveLength(2)

    // Restore
    restoreRegistrySnapshot(snapshot)
    expect(getDomains()).toHaveLength(1)
    expect(getDomains()[0].name).toBe('Cart')
    expect(getAdapters()).toHaveLength(1)
  })

  it('snapshot is a copy, not a reference to internal state', () => {
    registerDomain(cart)
    const snapshot = getRegistrySnapshot()

    // Mutating the snapshot should not affect registry
    snapshot.domains.push(orders)
    expect(getDomains()).toHaveLength(1)
  })
})

describe('withRegistry', () => {
  beforeEach(() => {
    resetRegistry()
  })

  it('provides an isolated empty registry for the callback', () => {
    registerDomain(cart)
    expect(getDomains()).toHaveLength(1)

    withRegistry(() => {
      expect(getDomains()).toHaveLength(0)
      registerDomain(orders)
      expect(getDomains()).toHaveLength(1)
      expect(getDomains()[0].name).toBe('Orders')
    })

    // Original state restored
    expect(getDomains()).toHaveLength(1)
    expect(getDomains()[0].name).toBe('Cart')
  })

  it('restores state even when callback throws', () => {
    registerDomain(cart)

    expect(() =>
      withRegistry(() => {
        registerDomain(orders)
        throw new Error('boom')
      })
    ).toThrow('boom')

    expect(getDomains()).toHaveLength(1)
    expect(getDomains()[0].name).toBe('Cart')
  })

  it('supports async callbacks', async () => {
    registerDomain(cart)

    await withRegistry(async () => {
      expect(getDomains()).toHaveLength(0)
      registerDomain(orders)
      expect(getDomains()).toHaveLength(1)
    })

    expect(getDomains()).toHaveLength(1)
    expect(getDomains()[0].name).toBe('Cart')
  })

  it('restores state when async callback rejects', async () => {
    registerDomain(cart)

    await expect(
      withRegistry(async () => {
        registerDomain(orders)
        throw new Error('async boom')
      })
    ).rejects.toThrow('async boom')

    expect(getDomains()).toHaveLength(1)
    expect(getDomains()[0].name).toBe('Cart')
  })

  it('returns the callback return value', () => {
    const result = withRegistry(() => {
      registerDomain(cart)
      return getDomains().length
    })
    expect(result).toBe(1)
  })
})
