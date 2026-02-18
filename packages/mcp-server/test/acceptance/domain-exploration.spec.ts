import { describe, beforeEach } from 'vitest'
import { suite, registerAdapter, resetRegistry } from '@aver/core'
import { averMcp } from './domains/aver-mcp'
import { averMcpAdapter } from './adapters/aver-mcp.unit'
import { averMcpIntegrationAdapter } from './adapters/aver-mcp.mcp'

registerAdapter(averMcpAdapter)
registerAdapter(averMcpIntegrationAdapter)

describe('MCP Domain Exploration (acceptance)', () => {
  const { test } = suite(averMcp)

  beforeEach(() => {
    resetRegistry()
  })

  test('lists registered domains with vocabulary summaries', async ({ act, query }) => {
    await act.registerTestDomain({
      name: 'Cart',
      actions: ['addItem', 'checkout'],
      queries: ['total'],
      assertions: ['isEmpty'],
    })

    const domains = await query.domainList()
    if (domains.length !== 1) throw new Error(`Expected 1 domain, got ${domains.length}`)
    if (domains[0].name !== 'Cart') throw new Error(`Expected 'Cart', got '${domains[0].name}'`)
    if (domains[0].actionCount !== 2) throw new Error(`Expected 2 actions, got ${domains[0].actionCount}`)
    if (domains[0].queryCount !== 1) throw new Error(`Expected 1 query, got ${domains[0].queryCount}`)
  })

  test('gets vocabulary for a specific domain', async ({ act, query }) => {
    await act.registerTestDomain({
      name: 'Auth',
      actions: ['login', 'logout'],
      queries: ['currentUser'],
      assertions: ['isLoggedIn'],
    })

    const vocab = await query.domainVocabulary({ name: 'Auth' })
    if (!vocab) throw new Error('Expected vocabulary but got null')
    if (vocab.name !== 'Auth') throw new Error(`Expected 'Auth', got '${vocab.name}'`)
    if (vocab.actions.length !== 2) throw new Error(`Expected 2 actions, got ${vocab.actions.length}`)
    if (vocab.queries.length !== 1) throw new Error(`Expected 1 query, got ${vocab.queries.length}`)
  })

  test('returns null for unknown domain vocabulary', async ({ query }) => {
    const result = await query.domainVocabulary({ name: 'NonExistent' })
    if (result !== null) throw new Error(`Expected null but got ${JSON.stringify(result)}`)
  })

  test('lists all registered adapters', async ({ act, query }) => {
    await act.registerTestDomain({
      name: 'Cart',
      actions: ['addItem'],
      queries: [],
      assertions: [],
    })

    const adapters = await query.adapterList()
    const cartAdapter = adapters.find(a => a.domainName === 'Cart')
    if (!cartAdapter) throw new Error(`Expected adapter for 'Cart' but found: ${adapters.map(a => a.domainName).join(', ')}`)
  })

  test('returns null for project context when no config loaded', async ({ query }) => {
    const result = await query.projectContext()
    if (result !== null) throw new Error(`Expected null but got ${JSON.stringify(result)}`)
  })
})
