import { describe, beforeEach } from 'vitest'
import { suite, resetRegistry } from 'aver'
import { averMcp } from './domains/aver-mcp'
import { averMcpAdapter } from './adapters/aver-mcp.direct'

describe('MCP Domain Exploration (acceptance)', () => {
  const { test } = suite(averMcp, averMcpAdapter)

  beforeEach(() => {
    resetRegistry()
  })

  test('lists registered domains with vocabulary summaries', async ({ domain }) => {
    await domain.registerTestDomain({
      name: 'Cart',
      actions: ['addItem', 'checkout'],
      queries: ['total'],
      assertions: ['isEmpty'],
    })

    await domain.callTool({ tool: 'list_domains' })

    await domain.toolResultHasLength({ length: 1 })
    await domain.toolResultContains({ path: '0.name', expected: 'Cart' })
    await domain.toolResultContains({ path: '0.actionCount', expected: 2 })
    await domain.toolResultContains({ path: '0.queryCount', expected: 1 })
  })

  test('gets vocabulary for a specific domain', async ({ domain }) => {
    await domain.registerTestDomain({
      name: 'Auth',
      actions: ['login', 'logout'],
      queries: ['currentUser'],
      assertions: ['isLoggedIn'],
    })

    await domain.callTool({ tool: 'get_domain_vocabulary', input: { domain: 'Auth' } })

    await domain.toolResultContains({ path: 'name', expected: 'Auth' })
    await domain.toolResultContains({ path: 'actions', expected: ['login', 'logout'] })
    await domain.toolResultContains({ path: 'queries', expected: ['currentUser'] })
  })

  test('returns null for unknown domain vocabulary', async ({ domain }) => {
    await domain.callTool({ tool: 'get_domain_vocabulary', input: { domain: 'NonExistent' } })

    await domain.toolResultIsError({ substring: 'not found' })
  })

  test('lists all registered adapters', async ({ domain }) => {
    await domain.registerTestDomain({
      name: 'Cart',
      actions: ['addItem'],
      queries: [],
      assertions: [],
    })

    await domain.callTool({ tool: 'list_adapters' })

    await domain.toolResultContains({ path: '0.domainName', expected: 'Cart' })
  })
})
