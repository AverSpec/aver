import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resetRegistry, getDomains } from '@aver/core'
import {
  scanConventionDirs,
  discoverDomains,
  scanAdapterFiles,
  matchDomainByKebab,
  isDomain,
  toKebabCase,
  discoverAndRegister,
  getDomainFilePaths,
  resetDiscoveryCache,
} from '../src/discovery'

describe('toKebabCase', () => {
  it('converts camelCase to kebab-case', () => {
    expect(toKebabCase('shoppingCart')).toBe('shopping-cart')
  })

  it('converts PascalCase to kebab-case', () => {
    expect(toKebabCase('ShoppingCart')).toBe('shopping-cart')
  })

  it('handles consecutive uppercase letters', () => {
    expect(toKebabCase('HTMLParser')).toBe('html-parser')
  })

  it('handles single word', () => {
    expect(toKebabCase('cart')).toBe('cart')
  })
})

describe('isDomain', () => {
  it('returns true for valid domain shape', () => {
    expect(isDomain({
      name: 'Cart',
      vocabulary: { actions: {}, queries: {}, assertions: {} },
    })).toBe(true)
  })

  it('returns false for null', () => {
    expect(isDomain(null)).toBe(false)
  })

  it('returns false for non-object', () => {
    expect(isDomain('string')).toBe(false)
  })

  it('returns false when name is missing', () => {
    expect(isDomain({
      vocabulary: { actions: {}, queries: {}, assertions: {} },
    })).toBe(false)
  })

  it('returns false when vocabulary is missing', () => {
    expect(isDomain({ name: 'Cart' })).toBe(false)
  })

  it('returns false when vocabulary is incomplete', () => {
    expect(isDomain({
      name: 'Cart',
      vocabulary: { actions: {} },
    })).toBe(false)
  })

  it('returns false for a function', () => {
    expect(isDomain(() => {})).toBe(false)
  })
})

describe('scanConventionDirs', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aver-scan-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('finds directories matching target name', async () => {
    mkdirSync(join(tmpDir, 'domains'))
    const result = await scanConventionDirs(tmpDir, 'domains')
    expect(result).toEqual([join(tmpDir, 'domains')])
  })

  it('finds nested directories', async () => {
    mkdirSync(join(tmpDir, 'sub', 'domains'), { recursive: true })
    const result = await scanConventionDirs(tmpDir, 'domains')
    expect(result).toEqual([join(tmpDir, 'sub', 'domains')])
  })

  it('finds multiple matches', async () => {
    mkdirSync(join(tmpDir, 'a', 'domains'), { recursive: true })
    mkdirSync(join(tmpDir, 'b', 'domains'), { recursive: true })
    const result = await scanConventionDirs(tmpDir, 'domains')
    expect(result).toHaveLength(2)
  })

  it('skips node_modules', async () => {
    mkdirSync(join(tmpDir, 'node_modules', 'domains'), { recursive: true })
    const result = await scanConventionDirs(tmpDir, 'domains')
    expect(result).toEqual([])
  })

  it('skips .git', async () => {
    mkdirSync(join(tmpDir, '.git', 'domains'), { recursive: true })
    const result = await scanConventionDirs(tmpDir, 'domains')
    expect(result).toEqual([])
  })

  it('skips dist', async () => {
    mkdirSync(join(tmpDir, 'dist', 'domains'), { recursive: true })
    const result = await scanConventionDirs(tmpDir, 'domains')
    expect(result).toEqual([])
  })

  it('returns empty for nonexistent root', async () => {
    const result = await scanConventionDirs(join(tmpDir, 'nonexistent'), 'domains')
    expect(result).toEqual([])
  })

  it('does not recurse into matching directories', async () => {
    // If domains/ contains a nested domains/, we should only find the outer one
    mkdirSync(join(tmpDir, 'domains', 'domains'), { recursive: true })
    const result = await scanConventionDirs(tmpDir, 'domains')
    expect(result).toEqual([join(tmpDir, 'domains')])
  })
})

describe('discoverDomains', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aver-discover-'))
    resetRegistry()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('discovers domain from a .ts file exporting a domain object', async () => {
    mkdirSync(join(tmpDir, 'domains'))
    writeFileSync(join(tmpDir, 'domains', 'cart.ts'), `
      export const Cart = {
        name: 'Cart',
        vocabulary: {
          actions: { addItem: {} },
          queries: { total: {} },
          assertions: { isEmpty: {} },
        },
        extend() { return this; },
      }
    `)
    const results = await discoverDomains(tmpDir)
    expect(results).toHaveLength(1)
    expect(results[0].domain.name).toBe('Cart')
    expect(results[0].filePath).toBe(join(tmpDir, 'domains', 'cart.ts'))
  })

  it('discovers multiple domains from one file', async () => {
    mkdirSync(join(tmpDir, 'domains'))
    writeFileSync(join(tmpDir, 'domains', 'all.ts'), `
      export const Cart = {
        name: 'Cart',
        vocabulary: { actions: {}, queries: {}, assertions: {} },
      }
      export const Orders = {
        name: 'Orders',
        vocabulary: { actions: {}, queries: {}, assertions: {} },
      }
    `)
    const results = await discoverDomains(tmpDir)
    expect(results).toHaveLength(2)
  })

  it('deduplicates domains by name', async () => {
    mkdirSync(join(tmpDir, 'a', 'domains'), { recursive: true })
    mkdirSync(join(tmpDir, 'b', 'domains'), { recursive: true })
    const content = `
      export const Cart = {
        name: 'Cart',
        vocabulary: { actions: {}, queries: {}, assertions: {} },
      }
    `
    writeFileSync(join(tmpDir, 'a', 'domains', 'cart.ts'), content)
    writeFileSync(join(tmpDir, 'b', 'domains', 'cart.ts'), content)
    const results = await discoverDomains(tmpDir)
    expect(results).toHaveLength(1)
  })

  it('skips files that fail to import', async () => {
    mkdirSync(join(tmpDir, 'domains'))
    writeFileSync(join(tmpDir, 'domains', 'bad.ts'), 'this is not valid javascript syntax }{}{')
    const results = await discoverDomains(tmpDir)
    expect(results).toEqual([])
  })

  it('skips non-domain exports', async () => {
    mkdirSync(join(tmpDir, 'domains'))
    writeFileSync(join(tmpDir, 'domains', 'util.ts'), `
      export const helper = 'not a domain'
      export const config = { key: 'value' }
    `)
    const results = await discoverDomains(tmpDir)
    expect(results).toEqual([])
  })

  it('returns empty when no domains/ dirs exist', async () => {
    const results = await discoverDomains(tmpDir)
    expect(results).toEqual([])
  })
})

describe('scanAdapterFiles', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aver-adapters-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('parses adapter filenames', async () => {
    mkdirSync(join(tmpDir, 'adapters'))
    writeFileSync(join(tmpDir, 'adapters', 'cart.unit.ts'), '')
    writeFileSync(join(tmpDir, 'adapters', 'cart.playwright.ts'), '')

    const results = await scanAdapterFiles(tmpDir)
    expect(results).toHaveLength(2)
    expect(results).toContainEqual({
      domainKebab: 'cart',
      protocol: 'unit',
      filePath: join(tmpDir, 'adapters', 'cart.unit.ts'),
    })
    expect(results).toContainEqual({
      domainKebab: 'cart',
      protocol: 'playwright',
      filePath: join(tmpDir, 'adapters', 'cart.playwright.ts'),
    })
  })

  it('handles multi-segment kebab domain names', async () => {
    mkdirSync(join(tmpDir, 'adapters'))
    writeFileSync(join(tmpDir, 'adapters', 'task-board.http.ts'), '')

    const results = await scanAdapterFiles(tmpDir)
    expect(results).toEqual([{
      domainKebab: 'task-board',
      protocol: 'http',
      filePath: join(tmpDir, 'adapters', 'task-board.http.ts'),
    }])
  })

  it('skips files without protocol segment', async () => {
    mkdirSync(join(tmpDir, 'adapters'))
    writeFileSync(join(tmpDir, 'adapters', 'cart.ts'), '')
    writeFileSync(join(tmpDir, 'adapters', 'README.md'), '')

    const results = await scanAdapterFiles(tmpDir)
    expect(results).toEqual([])
  })

  it('returns empty when no adapters/ dirs exist', async () => {
    const results = await scanAdapterFiles(tmpDir)
    expect(results).toEqual([])
  })
})

describe('matchDomainByKebab', () => {
  const domains = [
    { name: 'ShoppingCart', vocabulary: { actions: {}, queries: {}, assertions: {} } },
    { name: 'Orders', vocabulary: { actions: {}, queries: {}, assertions: {} } },
  ] as any[]

  it('matches a domain by kebab name', () => {
    expect(matchDomainByKebab('shopping-cart', domains)?.name).toBe('ShoppingCart')
  })

  it('matches a simple domain', () => {
    expect(matchDomainByKebab('orders', domains)?.name).toBe('Orders')
  })

  it('returns undefined for no match', () => {
    expect(matchDomainByKebab('unknown', domains)).toBeUndefined()
  })
})

describe('discoverAndRegister', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aver-register-'))
    resetRegistry()
    resetDiscoveryCache()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('registers discovered domains into the global registry', async () => {
    mkdirSync(join(tmpDir, 'domains'))
    writeFileSync(join(tmpDir, 'domains', 'cart.ts'), `
      export const Cart = {
        name: 'Cart',
        vocabulary: { actions: {}, queries: {}, assertions: {} },
      }
    `)

    await discoverAndRegister(tmpDir)
    expect(getDomains()).toHaveLength(1)
    expect(getDomains()[0].name).toBe('Cart')
  })

  it('populates domain file path cache', async () => {
    mkdirSync(join(tmpDir, 'domains'))
    writeFileSync(join(tmpDir, 'domains', 'cart.ts'), `
      export const Cart = {
        name: 'Cart',
        vocabulary: { actions: {}, queries: {}, assertions: {} },
      }
    `)

    await discoverAndRegister(tmpDir)
    const paths = getDomainFilePaths()
    expect(paths.get('Cart')).toBe(join(tmpDir, 'domains', 'cart.ts'))
  })
})
