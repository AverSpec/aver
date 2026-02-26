import { describe, it, expect, beforeEach } from 'vitest'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveConfigPath, loadConfig, reloadConfig, setProjectRoot } from '../src/config'

describe('resolveConfigPath()', () => {
  it('returns --config flag value when provided', () => {
    const result = resolveConfigPath(['--config', '/tmp/my.config.ts'])
    expect(result).toBe('/tmp/my.config.ts')
  })

  it('returns undefined when no flag and no file exists', () => {
    const result = resolveConfigPath([], '/nonexistent/path')
    expect(result).toBeUndefined()
  })
})

describe('loadConfig()', () => {
  it('throws when config file is malformed JavaScript', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'aver-config-test-'))
    const configPath = join(tempDir, 'broken.config.js')
    writeFileSync(configPath, 'this is not valid javascript {{{')

    try {
      await expect(loadConfig(configPath)).rejects.toThrow()
    } finally {
      rmSync(tempDir, { recursive: true })
    }
  })

  it('throws when config file has invalid syntax', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'aver-config-test-'))
    const configPath = join(tempDir, 'broken.config.js')
    writeFileSync(configPath, 'const x = {]')

    try {
      await expect(loadConfig(configPath)).rejects.toThrow()
    } finally {
      rmSync(tempDir, { recursive: true })
    }
  })
})

describe('reloadConfig()', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'aver-reload-config-test-'))
  })

  it('throws when existing config file is broken instead of falling back to discovery', async () => {
    const configPath = join(tempDir, 'broken.config.js')
    writeFileSync(configPath, 'this is not valid {{{')

    setProjectRoot(tempDir)

    try {
      // First set up the config path so reloadConfig will try to reload it
      await loadConfig(configPath).catch(() => {}) // Ignore initial load failure

      // Now when we reload, it should throw instead of falling back to discovery
      await expect(reloadConfig()).rejects.toThrow()
    } finally {
      rmSync(tempDir, { recursive: true })
    }
  })
})
