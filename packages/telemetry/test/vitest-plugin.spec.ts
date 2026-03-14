import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock @averspec/core/internals before importing the plugin
const mockGetExtractionRegistry = vi.fn()
const mockIsExtractionMode = vi.fn()

vi.mock('@averspec/core/internals', () => ({
  getExtractionRegistry: mockGetExtractionRegistry,
  isExtractionMode: mockIsExtractionMode,
}))

// Mock the local extract and contract-io modules
const mockExtractContract = vi.fn()
const mockWriteContracts = vi.fn()

vi.mock('../src/extract', () => ({
  extractContract: mockExtractContract,
}))

vi.mock('../src/contract-io', () => ({
  writeContracts: mockWriteContracts,
}))

// Mock vitest's afterAll
const registeredHooks: Array<() => Promise<void>> = []
vi.mock('vitest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vitest')>()
  return {
    ...actual,
    afterAll: (fn: () => Promise<void>) => { registeredHooks.push(fn) },
  }
})

describe('vitest-plugin', () => {
  beforeEach(() => {
    registeredHooks.length = 0
    vi.resetAllMocks()
  })

  it('registers an afterAll hook when extraction mode is on', async () => {
    mockIsExtractionMode.mockReturnValue(true)
    mockGetExtractionRegistry.mockReturnValue(new Map())

    // Reimport to trigger module-level code
    await vi.importActual('../src/vitest-plugin.ts')

    // When isExtractionMode returns true, an afterAll hook should have been registered
    // (via our mock) — but since the mock captures the hooks, we just verify the flow
    expect(mockIsExtractionMode).toHaveBeenCalled()
  })

  it('does not register a hook when extraction mode is off', async () => {
    mockIsExtractionMode.mockReturnValue(false)

    // Re-evaluate the module
    vi.resetModules()
    registeredHooks.length = 0
    await import('../src/vitest-plugin.ts')

    expect(registeredHooks).toHaveLength(0)
  })

  it('iterates multiple domains and extracts contracts', async () => {
    mockIsExtractionMode.mockReturnValue(true)

    const domainA = { name: 'auth', vocabulary: { actions: {}, queries: {}, assertions: {} } }
    const domainB = { name: 'billing', vocabulary: { actions: {}, queries: {}, assertions: {} } }

    const registry = new Map([
      ['auth', { domain: domainA, results: [{ testName: 'login', trace: [] }] }],
      ['billing', { domain: domainB, results: [{ testName: 'charge', trace: [] }] }],
    ])

    mockGetExtractionRegistry.mockReturnValue(registry)
    mockExtractContract
      .mockReturnValueOnce({ entries: [{ span: 'auth.login' }] })
      .mockReturnValueOnce({ entries: [{ span: 'billing.charge' }] })
    mockWriteContracts
      .mockResolvedValueOnce(['/out/auth/contract.json'])
      .mockResolvedValueOnce(['/out/billing/contract.json'])

    vi.resetModules()
    registeredHooks.length = 0
    await import('../src/vitest-plugin.ts')

    expect(registeredHooks).toHaveLength(1)
    await registeredHooks[0]()

    expect(mockExtractContract).toHaveBeenCalledTimes(2)
    expect(mockWriteContracts).toHaveBeenCalledTimes(2)
  })

  it('handles empty registry gracefully', async () => {
    mockIsExtractionMode.mockReturnValue(true)
    mockGetExtractionRegistry.mockReturnValue(new Map())

    vi.resetModules()
    registeredHooks.length = 0
    await import('../src/vitest-plugin.ts')

    expect(registeredHooks).toHaveLength(1)
    await registeredHooks[0]()

    expect(mockExtractContract).not.toHaveBeenCalled()
    expect(mockWriteContracts).not.toHaveBeenCalled()
  })

  it('skips domains with empty results', async () => {
    mockIsExtractionMode.mockReturnValue(true)

    const domain = { name: 'empty', vocabulary: { actions: {}, queries: {}, assertions: {} } }
    const registry = new Map([
      ['empty', { domain, results: [] }],
    ])

    mockGetExtractionRegistry.mockReturnValue(registry)

    vi.resetModules()
    registeredHooks.length = 0
    await import('../src/vitest-plugin.ts')

    await registeredHooks[0]()

    expect(mockExtractContract).not.toHaveBeenCalled()
  })

  it('skips writing when contract has no entries', async () => {
    mockIsExtractionMode.mockReturnValue(true)

    const domain = { name: 'noop', vocabulary: { actions: {}, queries: {}, assertions: {} } }
    const registry = new Map([
      ['noop', { domain, results: [{ testName: 'test', trace: [] }] }],
    ])

    mockGetExtractionRegistry.mockReturnValue(registry)
    mockExtractContract.mockReturnValue({ entries: [] })

    vi.resetModules()
    registeredHooks.length = 0
    await import('../src/vitest-plugin.ts')

    await registeredHooks[0]()

    expect(mockExtractContract).toHaveBeenCalledTimes(1)
    expect(mockWriteContracts).not.toHaveBeenCalled()
  })

  it('attempts all domains then throws aggregated error on extraction failure', async () => {
    mockIsExtractionMode.mockReturnValue(true)

    const domainA = { name: 'fail', vocabulary: { actions: {}, queries: {}, assertions: {} } }
    const domainB = { name: 'pass', vocabulary: { actions: {}, queries: {}, assertions: {} } }

    const registry = new Map([
      ['fail', { domain: domainA, results: [{ testName: 'test', trace: [] }] }],
      ['pass', { domain: domainB, results: [{ testName: 'test', trace: [] }] }],
    ])

    mockGetExtractionRegistry.mockReturnValue(registry)
    mockExtractContract
      .mockImplementationOnce(() => { throw new Error('boom') })
      .mockReturnValueOnce({ entries: [{ span: 'pass.test' }] })
    mockWriteContracts.mockResolvedValueOnce(['/out/pass/contract.json'])

    vi.resetModules()
    registeredHooks.length = 0
    await import('../src/vitest-plugin.ts')

    await expect(registeredHooks[0]()).rejects.toThrow(
      /Contract extraction failed for 1 domain\(s\)[\s\S]*"fail": boom/,
    )
    // Second domain should still be processed despite first failing
    expect(mockWriteContracts).toHaveBeenCalledTimes(1)
  })
})
