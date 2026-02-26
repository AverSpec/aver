import { describe, beforeEach, expect } from 'vitest'
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

  test('lists registered domains with vocabulary summaries', async ({ given, query }) => {
    await given.registerTestDomain({
      name: 'Cart',
      actions: ['addItem', 'checkout'],
      queries: ['total'],
      assertions: ['isEmpty'],
    })

    const domains = await query.domainList()
    expect(domains).toHaveLength(1)
    expect(domains[0].name).toBe('Cart')
    expect(domains[0].actionCount).toBe(2)
    expect(domains[0].queryCount).toBe(1)
  })

  test('gets vocabulary for a specific domain', async ({ given, query }) => {
    await given.registerTestDomain({
      name: 'Auth',
      actions: ['login', 'logout'],
      queries: ['currentUser'],
      assertions: ['isLoggedIn'],
    })

    const vocab = await query.domainVocabulary({ name: 'Auth' })
    expect(vocab).not.toBeNull()
    expect(vocab!.name).toBe('Auth')
    expect(vocab!.actions).toHaveLength(2)
    expect(vocab!.queries).toHaveLength(1)
  })

  test('returns null for unknown domain vocabulary', async ({ query }) => {
    const result = await query.domainVocabulary({ name: 'NonExistent' })
    // TODO: consider adding domain assertion for null vocabulary
    expect(result).toBeNull()
  })

  test('lists all registered adapters', async ({ given, query }) => {
    await given.registerTestDomain({
      name: 'Cart',
      actions: ['addItem'],
      queries: [],
      assertions: [],
    })

    const adapters = await query.adapterList()
    const cartAdapter = adapters.find(a => a.domainName === 'Cart')
    // TODO: consider adding domain assertion for adapter definition
    expect(cartAdapter).toBeDefined()
  })

  test('returns null for project context when no config loaded', async ({ query }) => {
    const result = await query.projectContext()
    // TODO: consider adding domain assertion for null project context
    expect(result).toBeNull()
  })
})
