import { describe, it, expect } from 'vitest'
import { resolveConfigPath } from '../src/config'

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
