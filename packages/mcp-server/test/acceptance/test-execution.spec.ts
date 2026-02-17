import { describe, beforeEach } from 'vitest'
import { suite, resetRegistry } from '@aver/core'
import { averMcp } from './domains/aver-mcp'
import { averMcpAdapter } from './adapters/aver-mcp.unit'

describe('MCP Test Execution (acceptance)', () => {
  const { test } = suite(averMcp, averMcpAdapter)

  beforeEach(() => {
    resetRegistry()
  })

  test('retrieves failure details after saving a run with failures', async ({ act, assert }) => {
    await act.saveTestRun({
      results: [
        { testName: 'passes', domain: 'Cart', status: 'pass', trace: [] },
        { testName: 'fails', domain: 'Cart', status: 'fail', trace: [
          { kind: 'assertion', name: 'isEmpty', status: 'fail', error: 'not empty' },
        ]},
      ],
    })

    await act.callTool({ tool: 'get_failure_details' })

    await assert.toolResultContains({ path: 'failures.0.testName', expected: 'fails' })
    await assert.toolResultContains({ path: 'failures.0.domain', expected: 'Cart' })
  })

  test('retrieves test trace by name', async ({ act, assert }) => {
    await act.saveTestRun({
      results: [
        { testName: 'my-test', domain: 'Cart', status: 'pass', trace: [
          { kind: 'action', name: 'addItem', status: 'pass' },
          { kind: 'query', name: 'total', status: 'pass' },
        ]},
      ],
    })

    await act.callTool({ tool: 'get_test_trace', input: { testName: 'my-test' } })

    await assert.toolResultContains({ path: 'testName', expected: 'my-test' })
    await assert.toolResultContains({ path: 'status', expected: 'pass' })
  })

  test('returns null trace for unknown test', async ({ act, assert }) => {
    await act.saveTestRun({ results: [] })

    await act.callTool({ tool: 'get_test_trace', input: { testName: 'nonexistent' } })

    await assert.toolResultIsError({ substring: 'not found' })
  })
})
