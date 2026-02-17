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
  resetRegistry, registerAdapter, registerDomain,
} from '@aver/core'

vi.mock('../../src/config.js', () => {
  let configPath: string | undefined
  let projectRoot: string | undefined
  return {
    getConfigPath: () => configPath,
    getProjectRoot: () => projectRoot,
    setConfigPathForTest: (path: string | undefined) => { configPath = path },
    setProjectRootForTest: (root: string | undefined) => { projectRoot = root },
    reloadConfig: async () => {},
  }
})

vi.mock('../../src/discovery.js', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
  }
})

// Import the mock setters
const { setConfigPathForTest, setProjectRootForTest } = await import('../../src/config.js') as any

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

  it('falls back to domain registry when adapter not found for protocol', () => {
    // registerAdapter already registers the domain, so getDomain('Cart') works
    const result = describeAdapterStructureHandler('Cart', 'playwright')
    expect(result).toEqual({
      domain: 'Cart',
      protocol: 'playwright',
      handlers: {
        actions: ['addItem', 'removeItem'],
        queries: ['total'],
        assertions: ['isEmpty', 'hasTotal'],
      },
    })
  })

  it('returns null when neither adapter nor domain found', () => {
    resetRegistry()
    const result = describeAdapterStructureHandler('Unknown', 'unit')
    expect(result).toBeNull()
  })

  it('returns structure from domain registry alone', () => {
    resetRegistry()
    registerDomain(cart)
    const result = describeAdapterStructureHandler('Cart', 'http')
    expect(result).toEqual({
      domain: 'Cart',
      protocol: 'http',
      handlers: {
        actions: ['addItem', 'removeItem'],
        queries: ['total'],
        assertions: ['isEmpty', 'hasTotal'],
      },
    })
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
    setProjectRootForTest(undefined)
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns null when no project root is set', async () => {
    setProjectRootForTest(undefined)
    const result = await getProjectContextHandler()
    expect(result).toBeNull()
  })

  it('returns project context with discovered files', async () => {
    // Create convention files
    mkdirSync(join(tmpDir, 'domains'))
    mkdirSync(join(tmpDir, 'adapters'))
    mkdirSync(join(tmpDir, 'tests'))
    writeFileSync(join(tmpDir, 'domains', 'cart.ts'), '')
    writeFileSync(join(tmpDir, 'adapters', 'cart.unit.ts'), '')
    writeFileSync(join(tmpDir, 'tests', 'cart.spec.ts'), '')

    setConfigPathForTest(join(tmpDir, 'aver.config.ts'))
    setProjectRootForTest(tmpDir)

    const result = await getProjectContextHandler()
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

  it('works without a config path (discovery only)', async () => {
    setProjectRootForTest(tmpDir)

    const result = await getProjectContextHandler()
    expect(result).not.toBeNull()
    expect(result!.configPath).toBeNull()
    expect(result!.projectRoot).toBe(tmpDir)
  })

  it('returns null for files that do not exist', async () => {
    setConfigPathForTest(join(tmpDir, 'aver.config.ts'))
    setProjectRootForTest(tmpDir)

    const result = await getProjectContextHandler()
    expect(result).not.toBeNull()
    expect(result!.domains[0].domainFile).toBeNull()
    expect(result!.domains[0].testFile).toBeNull()
    expect(result!.domains[0].adapters[0].file).toBeNull()
  })

  it('includes conventions in the response', async () => {
    setProjectRootForTest(tmpDir)

    const result = await getProjectContextHandler()
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
