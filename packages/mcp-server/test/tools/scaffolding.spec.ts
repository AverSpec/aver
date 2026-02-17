import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  describeDomainStructureHandler,
  describeAdapterStructureHandler,
  getProjectContextHandler,
} from '../../src/tools/scaffolding'
import {
  defineDomain, action, query, assertion,
  implement, unit,
  resetRegistry, registerAdapter,
} from '@aver/core'

vi.mock('../../src/config.js', () => {
  let configPath: string | undefined
  return {
    getConfigPath: () => configPath,
    setConfigPathForTest: (path: string | undefined) => { configPath = path },
    reloadConfig: async () => {},
  }
})

// Import the mock setter
const { setConfigPathForTest } = await import('../../src/config.js') as any

const cart = defineDomain({
  name: 'Cart',
  actions: { addItem: action(), removeItem: action() },
  queries: { total: query<number>() },
  assertions: { isEmpty: assertion(), hasTotal: assertion() },
})

const cartAdapter = implement(cart, {
  protocol: unit(() => null),
  actions: { addItem: async () => {}, removeItem: async () => {} },
  queries: { total: async () => 0 },
  assertions: { isEmpty: async () => {}, hasTotal: async () => {} },
})

describe('describe_domain_structure handler', () => {
  it('returns a template structure from a description', () => {
    const result = describeDomainStructureHandler('shopping cart')
    expect(result.suggestedName).toBe('shoppingCart')
    expect(result.actions).toBeDefined()
    expect(result.queries).toBeDefined()
    expect(result.assertions).toBeDefined()
    expect(result.actions.length).toBeGreaterThan(0)
  })
})

describe('describe_adapter_structure handler', () => {
  beforeEach(() => {
    resetRegistry()
    registerAdapter(cartAdapter)
  })

  it('returns handler structure for a domain and protocol', () => {
    const result = describeAdapterStructureHandler('Cart', 'unit')
    expect(result).toEqual({
      domain: 'Cart',
      protocol: 'unit',
      handlers: {
        actions: ['addItem', 'removeItem'],
        queries: ['total'],
        assertions: ['isEmpty', 'hasTotal'],
      },
    })
  })

  it('returns null when domain not found', () => {
    const result = describeAdapterStructureHandler('Unknown', 'unit')
    expect(result).toBeNull()
  })

  it('returns null when adapter for protocol not found', () => {
    const result = describeAdapterStructureHandler('Cart', 'playwright')
    expect(result).toBeNull()
  })
})

describe('get_project_context handler', () => {
  let tmpDir: string

  beforeEach(() => {
    resetRegistry()
    registerAdapter(cartAdapter)
    tmpDir = mkdtempSync(join(tmpdir(), 'aver-test-'))
  })

  afterEach(() => {
    setConfigPathForTest(undefined)
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns null when no config path is set', () => {
    setConfigPathForTest(undefined)
    const result = getProjectContextHandler()
    expect(result).toBeNull()
  })

  it('returns project context with discovered files', () => {
    // Create convention files
    mkdirSync(join(tmpDir, 'domains'))
    mkdirSync(join(tmpDir, 'adapters'))
    mkdirSync(join(tmpDir, 'tests'))
    writeFileSync(join(tmpDir, 'domains', 'cart.ts'), '')
    writeFileSync(join(tmpDir, 'adapters', 'cart.unit.ts'), '')
    writeFileSync(join(tmpDir, 'tests', 'cart.spec.ts'), '')

    setConfigPathForTest(join(tmpDir, 'aver.config.ts'))

    const result = getProjectContextHandler()
    expect(result).not.toBeNull()
    expect(result!.configPath).toBe('aver.config.ts')
    expect(result!.projectRoot).toBe(tmpDir)
    expect(result!.domains).toHaveLength(1)
    expect(result!.domains[0].name).toBe('Cart')
    expect(result!.domains[0].domainFile).toBe('domains/cart.ts')
    expect(result!.domains[0].testFile).toBe('tests/cart.spec.ts')
    expect(result!.domains[0].adapters).toEqual([
      { protocol: 'unit', file: 'adapters/cart.unit.ts' },
    ])
  })

  it('returns null for files that do not exist', () => {
    // No files created — just the config path set
    setConfigPathForTest(join(tmpDir, 'aver.config.ts'))

    const result = getProjectContextHandler()
    expect(result).not.toBeNull()
    expect(result!.domains[0].domainFile).toBeNull()
    expect(result!.domains[0].testFile).toBeNull()
    expect(result!.domains[0].adapters[0].file).toBeNull()
  })

  it('includes conventions in the response', () => {
    setConfigPathForTest(join(tmpDir, 'aver.config.ts'))

    const result = getProjectContextHandler()
    expect(result!.conventions).toEqual({
      domainDir: 'domains',
      adapterDir: 'adapters',
      testDir: 'tests',
      domainFilePattern: '{kebab-name}.ts',
      adapterFilePattern: '{kebab-name}.{protocol}.ts',
      testFilePattern: '{kebab-name}.spec.ts',
    })
  })
})
