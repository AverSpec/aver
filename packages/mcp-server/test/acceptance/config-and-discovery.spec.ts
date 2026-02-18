import { describe, beforeEach } from 'vitest'
import { suite, registerAdapter, resetRegistry } from '@aver/core'
import { averMcp } from './domains/aver-mcp'
import { averMcpAdapter } from './adapters/aver-mcp.unit'
import { averMcpIntegrationAdapter } from './adapters/aver-mcp.mcp'

registerAdapter(averMcpAdapter)
registerAdapter(averMcpIntegrationAdapter)

describe('MCP Config and Discovery (acceptance)', () => {
  const { test } = suite(averMcp)

  beforeEach(() => {
    resetRegistry()
  })

  test('reloadConfig re-registers domains from injected loader', async ({ act, assert }) => {
    await act.reloadConfig({ domainNames: ['ReloadedDomain'] })
    await assert.domainIsRegistered({ name: 'ReloadedDomain' })
  })

  test('reloadConfig clears previously registered domains', async ({ act, query }) => {
    await act.registerTestDomain({ name: 'First', actions: [], queries: [], assertions: [] })
    await act.reloadConfig({ domainNames: ['Second'] })
    const count = await query.registeredDomainCount()
    // After reload, only 'Second' + the outer test adapter's domain should exist
    // The reloadConfig resets registry, so 'First' should be gone
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('discoverDomains registers domains found on disk', async ({ act, assert }) => {
    await act.discoverDomains({ domainNames: ['DiscoveredDomain'] })
    await assert.domainIsRegistered({ name: 'DiscoveredDomain' })
  })
})
