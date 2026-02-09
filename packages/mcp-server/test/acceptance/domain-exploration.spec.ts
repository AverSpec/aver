import { describe, it, beforeEach, afterEach } from 'vitest'
import { suite, _resetRegistry, _registerAdapter } from 'aver'
import { averMcp } from './domains/aver-mcp'
import { averMcpAdapter } from './adapters/aver-mcp.direct'

describe('MCP Domain Exploration (acceptance)', () => {
  const s = suite(averMcp)

  beforeEach(async () => {
    _resetRegistry()
    _registerAdapter(averMcpAdapter)
    await s._setupForTest()
  })

  afterEach(async () => {
    await s._teardownForTest()
  })

  it('lists registered domains with vocabulary summaries', async () => {
    await s.domain.registerTestDomain({
      name: 'Cart',
      actions: ['addItem', 'checkout'],
      queries: ['total'],
      assertions: ['isEmpty'],
    })

    await s.domain.callTool({ tool: 'list_domains' })

    // AverMcp (our own domain) + Cart = 2 registered domains
    await s.domain.toolResultHasLength({ length: 2 })
    await s.domain.toolResultContains({ path: '1.name', expected: 'Cart' })
    await s.domain.toolResultContains({ path: '1.actionCount', expected: 2 })
    await s.domain.toolResultContains({ path: '1.queryCount', expected: 1 })
  })

  it('gets vocabulary for a specific domain', async () => {
    await s.domain.registerTestDomain({
      name: 'Auth',
      actions: ['login', 'logout'],
      queries: ['currentUser'],
      assertions: ['isLoggedIn'],
    })

    await s.domain.callTool({ tool: 'get_domain_vocabulary', input: { domain: 'Auth' } })

    await s.domain.toolResultContains({ path: 'name', expected: 'Auth' })
    await s.domain.toolResultContains({ path: 'actions', expected: ['login', 'logout'] })
    await s.domain.toolResultContains({ path: 'queries', expected: ['currentUser'] })
  })

  it('returns null for unknown domain vocabulary', async () => {
    await s.domain.callTool({ tool: 'get_domain_vocabulary', input: { domain: 'NonExistent' } })

    await s.domain.toolResultIsError({ substring: 'not found' })
  })

  it('lists all registered adapters', async () => {
    await s.domain.registerTestDomain({
      name: 'Cart',
      actions: ['addItem'],
      queries: [],
      assertions: [],
    })

    await s.domain.callTool({ tool: 'list_adapters' })

    // averMcpAdapter is registered first, so index 0 is AverMcp
    await s.domain.toolResultContains({ path: '0.domainName', expected: 'AverMcp' })
    await s.domain.toolResultContains({ path: '1.domainName', expected: 'Cart' })
  })
})
