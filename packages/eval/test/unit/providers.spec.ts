import { describe, it, expect, vi } from 'vitest'
import { agentSdkProvider } from '../../src/providers/agent-sdk'

// We can't call the real SDK in unit tests, but we can verify the provider
// is constructable and has the right interface
describe('agentSdkProvider', () => {
  it('returns an object with a judge method', () => {
    const provider = agentSdkProvider()
    expect(typeof provider.judge).toBe('function')
  })

  it('accepts a model option', () => {
    const provider = agentSdkProvider({ model: 'claude-haiku-4-5-20251001' })
    expect(typeof provider.judge).toBe('function')
  })
})
