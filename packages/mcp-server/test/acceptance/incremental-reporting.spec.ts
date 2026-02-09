import { describe, beforeEach } from 'vitest'
import { suite, resetRegistry } from 'aver'
import { averMcp } from './domains/aver-mcp'
import { averMcpAdapter } from './adapters/aver-mcp.direct'

describe('MCP Incremental Reporting (acceptance)', () => {
  const { test } = suite(averMcp, averMcpAdapter)

  beforeEach(() => {
    resetRegistry()
  })

  test('diffs two runs showing newly passing and newly failing', async ({ act, assert }) => {
    // First run: test-a passes, test-b fails
    await act.saveTestRun({
      results: [
        { testName: 'test-a', domain: 'Cart', status: 'pass', trace: [] },
        { testName: 'test-b', domain: 'Cart', status: 'fail', trace: [] },
      ],
    })

    // Second run: test-a fails, test-b passes
    await act.saveTestRun({
      results: [
        { testName: 'test-a', domain: 'Cart', status: 'fail', trace: [] },
        { testName: 'test-b', domain: 'Cart', status: 'pass', trace: [] },
      ],
    })

    await act.callTool({ tool: 'get_run_diff' })

    await assert.toolResultContains({ path: 'newlyFailing', expected: ['test-a'] })
    await assert.toolResultContains({ path: 'newlyPassing', expected: ['test-b'] })
  })

  test('returns error when fewer than 2 runs exist', async ({ act, assert }) => {
    await act.callTool({ tool: 'get_run_diff' })

    await assert.toolResultIsError({ substring: 'Need at least 2' })
  })
})
