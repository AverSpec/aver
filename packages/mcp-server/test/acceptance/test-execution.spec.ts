import { describe, beforeEach } from 'vitest'
import { suite, resetRegistry } from 'aver'
import { averMcp } from './domains/aver-mcp'
import { averMcpAdapter } from './adapters/aver-mcp.direct'

describe('MCP Test Execution (acceptance)', () => {
  const { test } = suite(averMcp, averMcpAdapter)

  beforeEach(() => {
    resetRegistry()
  })

  test('retrieves failure details after saving a run with failures', async ({ domain }) => {
    await domain.saveTestRun({
      results: [
        { testName: 'passes', domain: 'Cart', status: 'pass', trace: [] },
        { testName: 'fails', domain: 'Cart', status: 'fail', trace: [
          { kind: 'assertion', name: 'isEmpty', status: 'fail', error: 'not empty' },
        ]},
      ],
    })

    await domain.callTool({ tool: 'get_failure_details' })

    await domain.toolResultContains({ path: 'failures.0.testName', expected: 'fails' })
    await domain.toolResultContains({ path: 'failures.0.domain', expected: 'Cart' })
  })

  test('retrieves test trace by name', async ({ domain }) => {
    await domain.saveTestRun({
      results: [
        { testName: 'my-test', domain: 'Cart', status: 'pass', trace: [
          { kind: 'action', name: 'addItem', status: 'pass' },
          { kind: 'query', name: 'total', status: 'pass' },
        ]},
      ],
    })

    await domain.callTool({ tool: 'get_test_trace', input: { testName: 'my-test' } })

    await domain.toolResultContains({ path: 'testName', expected: 'my-test' })
    await domain.toolResultContains({ path: 'status', expected: 'pass' })
  })

  test('returns null trace for unknown test', async ({ domain }) => {
    await domain.saveTestRun({ results: [] })

    await domain.callTool({ tool: 'get_test_trace', input: { testName: 'nonexistent' } })

    await domain.toolResultIsError({ substring: 'not found' })
  })
})
