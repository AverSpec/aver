import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resetRegistry, getDomains } from '@aver/core'
import {
  discoverDomains,
  discoverAndRegister,
  resetDiscoveryCache,
} from '../src/discovery'
import {
  loadConfig,
  reloadConfig,
  resetConfigState,
  setProjectRoot,
} from '../src/config'
import { isProjectTrusted } from '../src/trust'

/**
 * Save and restore the env var around each test so tests don't leak state.
 */
function withEnv(key: string, value: string | undefined) {
  const original = process.env[key]
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
  return () => {
    if (original === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = original
    }
  }
}

describe('isProjectTrusted()', () => {
  let restore: () => void

  afterEach(() => restore?.())

  it('returns true when AVER_TRUST_PROJECT=1', () => {
    restore = withEnv('AVER_TRUST_PROJECT', '1')
    expect(isProjectTrusted()).toBe(true)
  })

  it('returns false when AVER_TRUST_PROJECT is unset', () => {
    restore = withEnv('AVER_TRUST_PROJECT', undefined)
    expect(isProjectTrusted()).toBe(false)
  })

  it('returns false when AVER_TRUST_PROJECT is empty string', () => {
    restore = withEnv('AVER_TRUST_PROJECT', '')
    expect(isProjectTrusted()).toBe(false)
  })

  it('returns false when AVER_TRUST_PROJECT=0', () => {
    restore = withEnv('AVER_TRUST_PROJECT', '0')
    expect(isProjectTrusted()).toBe(false)
  })

  it('returns false when AVER_TRUST_PROJECT=true (must be exactly "1")', () => {
    restore = withEnv('AVER_TRUST_PROJECT', 'true')
    expect(isProjectTrusted()).toBe(false)
  })
})

describe('security gate — discoverDomains', () => {
  let tmpDir: string
  let restore: () => void

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aver-trust-discovery-'))
    resetRegistry()
    resetDiscoveryCache()
  })

  afterEach(() => {
    restore?.()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('skips imports and returns empty when AVER_TRUST_PROJECT is not set', async () => {
    restore = withEnv('AVER_TRUST_PROJECT', undefined)

    mkdirSync(join(tmpDir, 'domains'))
    writeFileSync(
      join(tmpDir, 'domains', 'cart.ts'),
      `export const Cart = {
        name: 'Cart',
        vocabulary: { actions: {}, queries: {}, assertions: {} },
      }`
    )

    const results = await discoverDomains(tmpDir)
    expect(results).toEqual([])
  })

  it('imports domains normally when AVER_TRUST_PROJECT=1', async () => {
    restore = withEnv('AVER_TRUST_PROJECT', '1')

    mkdirSync(join(tmpDir, 'domains'))
    writeFileSync(
      join(tmpDir, 'domains', 'cart.ts'),
      `export const Cart = {
        name: 'Cart',
        vocabulary: { actions: {}, queries: {}, assertions: {} },
      }`
    )

    const results = await discoverDomains(tmpDir)
    expect(results).toHaveLength(1)
    expect(results[0].domain.name).toBe('Cart')
  })

  it('logs a warning when imports are skipped', async () => {
    restore = withEnv('AVER_TRUST_PROJECT', undefined)

    mkdirSync(join(tmpDir, 'domains'))
    writeFileSync(
      join(tmpDir, 'domains', 'cart.ts'),
      `export const Cart = {
        name: 'Cart',
        vocabulary: { actions: {}, queries: {}, assertions: {} },
      }`
    )

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await discoverDomains(tmpDir)
      expect(spy).toHaveBeenCalled()
      const logged = spy.mock.calls.map(c => c[0]).join('\n')
      expect(logged).toContain('AVER_TRUST_PROJECT')
      expect(logged).toContain('discovery')
    } finally {
      spy.mockRestore()
    }
  })
})

describe('security gate — discoverAndRegister', () => {
  let tmpDir: string
  let restore: () => void

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aver-trust-register-'))
    resetRegistry()
    resetDiscoveryCache()
  })

  afterEach(() => {
    restore?.()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('registers nothing when trust is not enabled', async () => {
    restore = withEnv('AVER_TRUST_PROJECT', undefined)

    mkdirSync(join(tmpDir, 'domains'))
    writeFileSync(
      join(tmpDir, 'domains', 'cart.ts'),
      `export const Cart = {
        name: 'Cart',
        vocabulary: { actions: {}, queries: {}, assertions: {} },
      }`
    )

    await discoverAndRegister(tmpDir)
    expect(getDomains()).toHaveLength(0)
  })
})

describe('security gate — loadConfig', () => {
  let tmpDir: string
  let restore: () => void

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aver-trust-config-'))
    resetConfigState()
  })

  afterEach(() => {
    restore?.()
    rmSync(tmpDir, { recursive: true, force: true })
    resetConfigState()
  })

  it('skips config import when AVER_TRUST_PROJECT is not set', async () => {
    restore = withEnv('AVER_TRUST_PROJECT', undefined)

    const configPath = join(tmpDir, 'aver.config.js')
    // This config would throw if executed, proving the import was skipped
    writeFileSync(configPath, 'throw new Error("should not be executed")')

    // Should not throw — the import is skipped
    await expect(loadConfig(configPath)).resolves.toBeUndefined()
  })

  it('imports config normally when AVER_TRUST_PROJECT=1', async () => {
    restore = withEnv('AVER_TRUST_PROJECT', '1')

    const configPath = join(tmpDir, 'aver.config.js')
    writeFileSync(configPath, 'export default {}')

    await expect(loadConfig(configPath)).resolves.toBeUndefined()
  })

  it('throws from config when AVER_TRUST_PROJECT=1 and config is broken', async () => {
    restore = withEnv('AVER_TRUST_PROJECT', '1')

    const configPath = join(tmpDir, 'aver.config.js')
    writeFileSync(configPath, 'throw new Error("intentionally broken")')

    await expect(loadConfig(configPath)).rejects.toThrow('intentionally broken')
  })
})

describe('security gate — reloadConfig', () => {
  let tmpDir: string
  let restore: () => void

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aver-trust-reload-'))
    resetConfigState()
    resetRegistry()
  })

  afterEach(() => {
    restore?.()
    rmSync(tmpDir, { recursive: true, force: true })
    resetConfigState()
  })

  it('skips reload import when AVER_TRUST_PROJECT is not set', async () => {
    restore = withEnv('AVER_TRUST_PROJECT', undefined)

    setProjectRoot(tmpDir)
    writeFileSync(
      join(tmpDir, 'aver.config.js'),
      'throw new Error("should not be executed")'
    )

    // reloadConfig should not throw — it's gated
    await expect(reloadConfig()).resolves.toBeUndefined()
  })

  it('still allows custom loader callback regardless of trust setting', async () => {
    restore = withEnv('AVER_TRUST_PROJECT', undefined)

    let called = false
    await reloadConfig(async () => { called = true })
    expect(called).toBe(true)
  })
})
