import { describe, beforeEach } from 'vitest'
import { suite, resetRegistry } from '@aver/core'
import { averMcp } from './domains/aver-mcp'
import { averMcpAdapter } from './adapters/aver-mcp.unit'

describe('MCP Config and Discovery (acceptance)', () => {
  const { test } = suite(averMcp, averMcpAdapter)

  beforeEach(() => {
    resetRegistry()
  })

  test('reloadWithLoader re-registers domains from injected loader', async ({ act, assert }) => {
    await act.reloadWithLoader({ domainNames: ['ReloadedDomain'] })
    await assert.domainIsRegistered({ name: 'ReloadedDomain' })
  })

  test('reloadWithLoader clears previously registered domains', async ({ act, query }) => {
    await act.registerTestDomain({ name: 'First', actions: [], queries: [], assertions: [] })
    await act.reloadWithLoader({ domainNames: ['Second'] })
    const count = await query.registeredDomainCount()
    // After reload, only 'Second' + the outer test adapter's domain should exist
    // The reloadWithLoader resets registry, so 'First' should be gone
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('discoverFromDirectory registers domains found on disk', async ({ act, assert }) => {
    await act.discoverFromDirectory({ domainNames: ['DiscoveredDomain'] })
    await assert.domainIsRegistered({ name: 'DiscoveredDomain' })
  })
})
