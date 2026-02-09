import { describe, beforeEach } from 'vitest'
import { suite, resetRegistry } from 'aver'
import { averMcp } from './domains/aver-mcp'
import { averMcpAdapter } from './adapters/aver-mcp.direct'

describe('MCP Scaffolding (acceptance)', () => {
  const { test } = suite(averMcp, averMcpAdapter)

  beforeEach(() => {
    resetRegistry()
  })

  test('generates a domain structure template from a description', async ({ domain }) => {
    await domain.callTool({
      tool: 'describe_domain_structure',
      input: { description: 'user authentication' },
    })

    await domain.toolResultContains({ path: 'suggestedName', expected: 'userAuthentication' })
    // Template always returns standard CRUD-like actions
    await domain.toolResultContains({ path: 'actions.0.name', expected: 'create' })
  })

  test('describes adapter structure for an existing domain', async ({ domain }) => {
    await domain.registerTestDomain({
      name: 'Cart',
      actions: ['addItem'],
      queries: ['total'],
      assertions: ['isEmpty'],
    })

    await domain.callTool({
      tool: 'describe_adapter_structure',
      input: { domain: 'Cart', protocol: 'test-inner' },
    })

    await domain.toolResultContains({ path: 'domain', expected: 'Cart' })
    await domain.toolResultContains({ path: 'handlers.actions', expected: ['addItem'] })
  })

  test('returns null for unknown domain adapter structure', async ({ domain }) => {
    await domain.callTool({
      tool: 'describe_adapter_structure',
      input: { domain: 'Unknown', protocol: 'direct' },
    })

    await domain.toolResultIsError({ substring: 'not found' })
  })
})
