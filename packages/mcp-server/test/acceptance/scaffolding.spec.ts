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

  test('generates a domain structure template from a description', async ({ query }) => {
    const structure = await query.domainStructure({ description: 'user authentication' })
    if (structure.suggestedName !== 'userAuthentication')
      throw new Error(`Expected 'userAuthentication', got '${structure.suggestedName}'`)
    if ((structure.actions as any[])[0].name !== 'create')
      throw new Error(`Expected first action to be 'create', got '${(structure.actions as any[])[0].name}'`)
  })

  test('describes adapter structure for an existing domain', async ({ act, query }) => {
    await act.registerTestDomain({
      name: 'Cart',
      actions: ['addItem'],
      queries: ['total'],
      assertions: ['isEmpty'],
    })

    const structure = await query.adapterStructure({ domain: 'Cart', protocol: 'test-inner' })
    if (!structure) throw new Error('Expected structure but got null')
    if (structure.domain !== 'Cart')
      throw new Error(`Expected 'Cart', got '${structure.domain}'`)
    if (structure.handlers.actions[0] !== 'addItem')
      throw new Error(`Expected 'addItem', got '${structure.handlers.actions[0]}'`)
  })

  test('returns null for unknown domain adapter structure', async ({ query }) => {
    const result = await query.adapterStructure({ domain: 'Unknown', protocol: 'direct' })
    if (result !== null) throw new Error(`Expected null but got ${JSON.stringify(result)}`)
  })
})
