import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { defineConfig, getCoverageConfig, resetCoverageConfig } from '../../src/core/config'
import { suite } from '../../src/core/suite'
import { resetRegistry } from '../../src/core/registry'
import { defineDomain } from '../../src/core/domain'
import { action, query, assertion } from '../../src/core/markers'
import { implement } from '../../src/core/adapter'
import { unit } from '../../src/protocols/unit'

beforeEach(() => {
  resetRegistry()
  resetCoverageConfig()
})

// ---------------------------------------------------------------------------
// Config storage
// ---------------------------------------------------------------------------

describe('getCoverageConfig()', () => {
  it('returns 0 (no enforcement) by default', () => {
    expect(getCoverageConfig()).toEqual({ minPercentage: 0 })
  })

  it('reflects minPercentage set via defineConfig', () => {
    defineConfig({ adapters: [], coverage: { minPercentage: 80 } })
    expect(getCoverageConfig().minPercentage).toBe(80)
  })

  it('defaults minPercentage to 0 when coverage object omitted', () => {
    defineConfig({ adapters: [] })
    expect(getCoverageConfig().minPercentage).toBe(0)
  })

  it('defaults minPercentage to 0 when coverage.minPercentage omitted', () => {
    defineConfig({ adapters: [], coverage: {} })
    expect(getCoverageConfig().minPercentage).toBe(0)
  })

  it('returns minPercentage on the AverConfig object returned by defineConfig', () => {
    const config = defineConfig({ adapters: [], coverage: { minPercentage: 75 } })
    expect(config.coverage.minPercentage).toBe(75)
  })

  it('resets to 0 after resetCoverageConfig', () => {
    defineConfig({ adapters: [], coverage: { minPercentage: 50 } })
    resetCoverageConfig()
    expect(getCoverageConfig().minPercentage).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// afterAll enforcement — exercised by inspecting thrown errors
// ---------------------------------------------------------------------------

/**
 * Build a minimal in-process domain + adapter and a suite whose calledOps
 * match the operations we call. Because we use the programmatic suite API
 * (setup/teardown/act/query/assert) the afterAll is the one registered by
 * the suite itself.
 *
 * We fake the afterAll callback by capturing it via vi.spyOn so we can
 * invoke it synchronously in the test.
 */
describe('suite() coverage threshold enforcement', () => {
  const cartDomain = defineDomain({
    name: 'ThresholdCart',
    actions: {
      addItem: action<{ name: string }>(),
      removeItem: action<{ name: string }>(),
    },
    queries: {
      total: query<number>(),
    },
    assertions: {
      isEmpty: assertion(),
    },
  })

  const cartAdapter = implement(cartDomain, {
    protocol: unit(() => ({})),
    actions: {
      addItem: async () => {},
      removeItem: async () => {},
    },
    queries: {
      total: async () => 0,
    },
    assertions: {
      isEmpty: async () => {},
    },
  })

  it('does not register an afterAll hook when threshold is 0 (default)', () => {
    // Spy on afterAll to see if it's called
    const afterAllSpy = vi.spyOn(globalThis as any, 'afterAll')
    resetCoverageConfig()

    suite(cartDomain, cartAdapter)

    // afterAll may be called by other suites/describes in this file, but NOT
    // by our suite call above because threshold is 0.
    // We check that none of the registered callbacks look like ours.
    const registered = afterAllSpy.mock.calls
    const coverageCbs = registered.filter(([cb]: [() => void]) => {
      // Invoke it in a safe context; the aver callback throws on low coverage
      try {
        cb()
        return false
      } catch (e: any) {
        return e.message?.includes('Vocabulary coverage')
      }
    })
    expect(coverageCbs).toHaveLength(0)

    afterAllSpy.mockRestore()
  })

  it('registers an afterAll hook when threshold > 0', () => {
    defineConfig({ adapters: [], coverage: { minPercentage: 50 } })

    const callbacks: Array<() => void> = []
    const afterAllSpy = vi.spyOn(globalThis as any, 'afterAll').mockImplementation((cb: () => void) => {
      callbacks.push(cb)
    })

    suite(cartDomain, cartAdapter)

    expect(callbacks.length).toBeGreaterThan(0)
    afterAllSpy.mockRestore()
  })

  it('afterAll callback passes when coverage meets threshold', () => {
    defineConfig({ adapters: [], coverage: { minPercentage: 50 } })

    const callbacks: Array<() => void> = []
    const afterAllSpy = vi.spyOn(globalThis as any, 'afterAll').mockImplementation((cb: () => void) => {
      callbacks.push(cb)
    })

    const s = suite(cartDomain, cartAdapter)

    // Call 2 of 4 operations (50%) — exactly at threshold
    ;(s.act as any).addItem({ name: 'x' })
    ;(s.query as any).total()

    afterAllSpy.mockRestore()

    // Find the coverage callback and invoke it — must not throw
    const coverageCb = callbacks.find(cb => {
      try { cb(); return false } catch (e: any) { return e?.message?.includes('Vocabulary coverage') }
    }) ?? callbacks[callbacks.length - 1]

    expect(() => coverageCb()).not.toThrow()
  })

  it('afterAll callback throws when coverage is below threshold', () => {
    defineConfig({ adapters: [], coverage: { minPercentage: 80 } })

    const callbacks: Array<() => void> = []
    const afterAllSpy = vi.spyOn(globalThis as any, 'afterAll').mockImplementation((cb: () => void) => {
      callbacks.push(cb)
    })

    suite(cartDomain, cartAdapter)
    // No operations called — 0% coverage, below 80% threshold

    afterAllSpy.mockRestore()

    const lastCb = callbacks[callbacks.length - 1]
    expect(() => lastCb()).toThrowError(
      /Vocabulary coverage for domain "ThresholdCart" is 0%, below the configured minimum of 80%/,
    )
  })

  it('error message lists uncovered operations', () => {
    defineConfig({ adapters: [], coverage: { minPercentage: 100 } })

    const callbacks: Array<() => void> = []
    const afterAllSpy = vi.spyOn(globalThis as any, 'afterAll').mockImplementation((cb: () => void) => {
      callbacks.push(cb)
    })

    const s = suite(cartDomain, cartAdapter)
    // Call only addItem (25% — 1 of 4)
    ;(s.act as any).addItem({ name: 'Widget' })

    afterAllSpy.mockRestore()

    const lastCb = callbacks[callbacks.length - 1]
    let thrown: Error | undefined
    try { lastCb() } catch (e: any) { thrown = e }

    expect(thrown).toBeDefined()
    expect(thrown!.message).toMatch(/removeItem/)
    expect(thrown!.message).toMatch(/total/)
    expect(thrown!.message).toMatch(/isEmpty/)
    // addItem was called — must NOT appear in uncovered list
    expect(thrown!.message).not.toMatch(/addItem/)
  })

  it('afterAll callback passes for empty domain (100% by default)', () => {
    const emptyDomain = defineDomain({
      name: 'EmptyThreshold',
      actions: {},
      queries: {},
      assertions: {},
    })
    const emptyAdapter = implement(emptyDomain, {
      protocol: unit(() => ({})),
      actions: {},
      queries: {},
      assertions: {},
    })

    defineConfig({ adapters: [], coverage: { minPercentage: 100 } })

    const callbacks: Array<() => void> = []
    const afterAllSpy = vi.spyOn(globalThis as any, 'afterAll').mockImplementation((cb: () => void) => {
      callbacks.push(cb)
    })

    suite(emptyDomain, emptyAdapter)

    afterAllSpy.mockRestore()

    const lastCb = callbacks[callbacks.length - 1]
    expect(() => lastCb()).not.toThrow()
  })
})
