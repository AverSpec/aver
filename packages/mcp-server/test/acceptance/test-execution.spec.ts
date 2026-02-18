import { describe, beforeEach } from 'vitest'
import { suite, registerAdapter, resetRegistry } from '@aver/core'
import { averMcp } from './domains/aver-mcp'
import { averMcpAdapter } from './adapters/aver-mcp.unit'
import { averMcpIntegrationAdapter } from './adapters/aver-mcp.mcp'

registerAdapter(averMcpAdapter)
registerAdapter(averMcpIntegrationAdapter)

describe('MCP Test Execution (acceptance)', () => {
  const { test } = suite(averMcp)

  beforeEach(() => {
    resetRegistry()
  })

  test('retrieves failure details after saving a run with failures', async ({ act, query }) => {
    await act.saveTestRun({
      results: [
        { testName: 'passes', domain: 'Cart', status: 'pass', trace: [] },
        { testName: 'fails', domain: 'Cart', status: 'fail', trace: [
          { kind: 'assertion', name: 'isEmpty', status: 'fail', error: 'not empty' },
        ]},
      ],
    })

    const details = await query.failureDetails()
    if (details.failures[0].testName !== 'fails')
      throw new Error(`Expected 'fails', got '${details.failures[0].testName}'`)
    if (details.failures[0].domain !== 'Cart')
      throw new Error(`Expected 'Cart', got '${details.failures[0].domain}'`)
  })

  test('retrieves test trace by name', async ({ act, query }) => {
    await act.saveTestRun({
      results: [
        { testName: 'my-test', domain: 'Cart', status: 'pass', trace: [
          { kind: 'action', name: 'addItem', status: 'pass' },
          { kind: 'query', name: 'total', status: 'pass' },
        ]},
      ],
    })

    const trace = await query.testTrace({ testName: 'my-test' })
    if (!trace) throw new Error('Expected trace but got null')
    if (trace.testName !== 'my-test')
      throw new Error(`Expected 'my-test', got '${trace.testName}'`)
    if (trace.status !== 'pass')
      throw new Error(`Expected 'pass', got '${trace.status}'`)
  })

  test('returns null trace for unknown test', async ({ act, query }) => {
    await act.saveTestRun({ results: [] })

    const trace = await query.testTrace({ testName: 'nonexistent' })
    if (trace !== null) throw new Error(`Expected null but got ${JSON.stringify(trace)}`)
  })

  // --- RunStore retention ---

  test('enforces 10-run retention limit', async ({ act, assert }) => {
    await act.saveMultipleRuns({ count: 12 })
    await assert.runCountIs({ count: 10 })
  })

  test('retains latest runs when pruning', async ({ act, assert }) => {
    await act.saveMultipleRuns({ count: 5 })
    await assert.runCountIs({ count: 5 })
  })
})
