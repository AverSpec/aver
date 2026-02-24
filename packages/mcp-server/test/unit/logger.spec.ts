import { describe, it, expect, vi, afterEach } from 'vitest'
import { log } from '../../src/logger.js'

describe('log()', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('outputs valid JSON to stderr', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    log('info', 'test message')

    expect(spy).toHaveBeenCalledOnce()
    const output = spy.mock.calls[0][0] as string
    expect(() => JSON.parse(output)).not.toThrow()
  })

  it('includes level, message, and timestamp', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    log('warn', 'something happened')

    const entry = JSON.parse(spy.mock.calls[0][0] as string)
    expect(entry.level).toBe('warn')
    expect(entry.message).toBe('something happened')
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('includes context fields in output', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    log('error', 'failure', { configPath: '/tmp/aver.config.ts', code: 42 })

    const entry = JSON.parse(spy.mock.calls[0][0] as string)
    expect(entry.level).toBe('error')
    expect(entry.message).toBe('failure')
    expect(entry.configPath).toBe('/tmp/aver.config.ts')
    expect(entry.code).toBe(42)
  })
})
