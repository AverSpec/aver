import { describe, beforeEach } from 'vitest'
import { suite, registerAdapter, resetRegistry } from '@aver/core'
import { averMcp } from './domains/aver-mcp'
import { averMcpAdapter } from './adapters/aver-mcp.unit'
import { averMcpIntegrationAdapter } from './adapters/aver-mcp.mcp'

registerAdapter(averMcpAdapter)
registerAdapter(averMcpIntegrationAdapter)

describe('MCP Scaffolding (acceptance)', () => {
  const { test } = suite(averMcp)

  beforeEach(() => {
    resetRegistry()
  })

  test('generates a domain structure template from a description', async ({ then }) => {
    await then.domainStructureSuggestedNameIs({ description: 'user authentication', name: 'userAuthentication' })
  })

  test('describes adapter structure for an existing domain', async ({ given, then }) => {
    await given.registerTestDomain({
      name: 'Cart',
      actions: ['addItem'],
      queries: ['total'],
      assertions: ['isEmpty'],
    })

    await then.adapterStructureDomainIs({ domain: 'Cart', protocol: 'test-inner', expectedDomain: 'Cart' })
    await then.adapterStructureFirstActionIs({ domain: 'Cart', protocol: 'test-inner', action: 'addItem' })
  })

  test('returns null for unknown domain adapter structure', async ({ then }) => {
    await then.adapterStructureIsNull({ domain: 'Unknown', protocol: 'direct' })
  })
})
