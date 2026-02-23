import { describe, beforeEach, expect } from 'vitest'
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

  test('generates a domain structure template from a description', async ({ query }) => {
    const structure = await query.domainStructure({ description: 'user authentication' })
    expect(structure.suggestedName).toBe('userAuthentication')
    expect((structure.actions as any[])[0].name).toBe('create')
  })

  test('describes adapter structure for an existing domain', async ({ act, query }) => {
    await act.registerTestDomain({
      name: 'Cart',
      actions: ['addItem'],
      queries: ['total'],
      assertions: ['isEmpty'],
    })

    const structure = await query.adapterStructure({ domain: 'Cart', protocol: 'test-inner' })
    expect(structure).not.toBeNull()
    expect(structure!.domain).toBe('Cart')
    expect(structure!.handlers.actions[0]).toBe('addItem')
  })

  test('returns null for unknown domain adapter structure', async ({ query }) => {
    const result = await query.adapterStructure({ domain: 'Unknown', protocol: 'direct' })
    expect(result).toBeNull()
  })
})
