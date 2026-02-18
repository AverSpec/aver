import { describe, beforeEach } from 'vitest'
import { suite, resetRegistry } from '@aver/core'
import { averMcp } from './domains/aver-mcp'
import { averMcpAdapter } from './adapters/aver-mcp.unit'

describe('MCP Domain Exploration (acceptance)', () => {
  const { test } = suite(averMcp, averMcpAdapter)

  beforeEach(() => {
    resetRegistry()
  })

  test('lists registered domains with vocabulary summaries', async ({ act, assert }) => {
    await act.registerTestDomain({
      name: 'Cart',
      actions: ['addItem', 'checkout'],
      queries: ['total'],
      assertions: ['isEmpty'],
    })

    await act.callTool({ tool: 'list_domains' })

    await assert.toolResultHasLength({ length: 1 })
    await assert.toolResultContains({ path: '0.name', expected: 'Cart' })
    await assert.toolResultContains({ path: '0.actionCount', expected: 2 })
    await assert.toolResultContains({ path: '0.queryCount', expected: 1 })
  })

  test('gets vocabulary for a specific domain', async ({ act, assert }) => {
    await act.registerTestDomain({
      name: 'Auth',
      actions: ['login', 'logout'],
      queries: ['currentUser'],
      assertions: ['isLoggedIn'],
    })

    await act.callTool({ tool: 'get_domain_vocabulary', input: { domain: 'Auth' } })

    await assert.toolResultContains({ path: 'name', expected: 'Auth' })
    await assert.toolResultContains({ path: 'actions', expected: ['login', 'logout'] })
    await assert.toolResultContains({ path: 'queries', expected: ['currentUser'] })
  })

  test('returns null for unknown domain vocabulary', async ({ act, assert }) => {
    await act.callTool({ tool: 'get_domain_vocabulary', input: { domain: 'NonExistent' } })

    await assert.toolResultIsError({ substring: 'not found' })
  })

  test('lists all registered adapters', async ({ act, assert }) => {
    await act.registerTestDomain({
      name: 'Cart',
      actions: ['addItem'],
      queries: [],
      assertions: [],
    })

    await act.callTool({ tool: 'list_adapters' })

    await assert.toolResultContains({ path: '0.domainName', expected: 'Cart' })
  })

  test('returns null for project context when no config loaded', async ({ act, assert }) => {
    await act.callTool({ tool: 'get_project_context' })

    // getProjectContextHandler returns null when getProjectRoot() has no root
    // (no aver.config loaded in the test environment)
    await assert.toolResultIsError({ substring: 'not found' })
  })
})
