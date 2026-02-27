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

  test('retrieves failure details after saving a run with failures', async ({ given, then }) => {
    await given.saveTestRun({
      results: [
        { testName: 'passes', domain: 'Cart', status: 'pass', trace: [] },
        { testName: 'fails', domain: 'Cart', status: 'fail', trace: [
          { kind: 'assertion', name: 'isEmpty', status: 'fail', error: 'not empty' },
        ]},
      ],
    })

    await then.firstFailureIs({ testName: 'fails', domain: 'Cart' })
  })

  test('retrieves test trace by name', async ({ given, then }) => {
    await given.saveTestRun({
      results: [
        { testName: 'my-test', domain: 'Cart', status: 'pass', trace: [
          { kind: 'action', name: 'addItem', status: 'pass' },
          { kind: 'query', name: 'total', status: 'pass' },
        ]},
      ],
    })

    await then.testTraceIs({ testName: 'my-test', status: 'pass' })
  })

  test('returns null trace for unknown test', async ({ given, then }) => {
    await given.saveTestRun({ results: [] })

    await then.testTraceIsNull({ testName: 'nonexistent' })
  })

  // --- RunStore retention ---

  test('enforces 10-run retention limit', async ({ given, then }) => {
    await given.saveMultipleRuns({ count: 12 })
    await then.runCountIs({ count: 10 })
  })

  test('retains latest runs when pruning', async ({ given, then }) => {
    await given.saveMultipleRuns({ count: 5 })
    await then.runCountIs({ count: 5 })
  })
})
