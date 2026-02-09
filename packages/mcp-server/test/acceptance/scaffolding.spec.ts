import { describe, it, beforeEach, afterEach } from 'vitest'
import { suite, _resetRegistry, _registerAdapter } from 'aver'
import { averMcp } from './domains/aver-mcp'
import { averMcpAdapter } from './adapters/aver-mcp.direct'

describe('MCP Scaffolding (acceptance)', () => {
  const s = suite(averMcp)

  beforeEach(async () => {
    _resetRegistry()
    _registerAdapter(averMcpAdapter)
    await s._setupForTest()
  })

  afterEach(async () => {
    await s._teardownForTest()
  })

  it('generates a domain structure template from a description', async () => {
    await s.domain.callTool({
      tool: 'describe_domain_structure',
      input: { description: 'user authentication' },
    })

    await s.domain.toolResultContains({ path: 'suggestedName', expected: 'userAuthentication' })
    // Template always returns standard CRUD-like actions
    await s.domain.toolResultContains({ path: 'actions.0.name', expected: 'create' })
  })

  it('describes adapter structure for an existing domain', async () => {
    await s.domain.registerTestDomain({
      name: 'Cart',
      actions: ['addItem'],
      queries: ['total'],
      assertions: ['isEmpty'],
    })

    await s.domain.callTool({
      tool: 'describe_adapter_structure',
      input: { domain: 'Cart', protocol: 'test-inner' },
    })

    await s.domain.toolResultContains({ path: 'domain', expected: 'Cart' })
    await s.domain.toolResultContains({ path: 'handlers.actions', expected: ['addItem'] })
  })

  it('returns null for unknown domain adapter structure', async () => {
    await s.domain.callTool({
      tool: 'describe_adapter_structure',
      input: { domain: 'Unknown', protocol: 'direct' },
    })

    await s.domain.toolResultIsError({ substring: 'not found' })
  })
})
