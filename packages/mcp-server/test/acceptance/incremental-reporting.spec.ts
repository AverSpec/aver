import { describe, it, beforeEach, afterEach } from 'vitest'
import { suite, _resetRegistry, _registerAdapter } from 'aver'
import { averMcp } from './domains/aver-mcp'
import { averMcpAdapter } from './adapters/aver-mcp.direct'

describe('MCP Incremental Reporting (acceptance)', () => {
  const s = suite(averMcp)

  beforeEach(async () => {
    _resetRegistry()
    _registerAdapter(averMcpAdapter)
    await s._setupForTest()
  })

  afterEach(async () => {
    await s._teardownForTest()
  })

  it('diffs two runs showing newly passing and newly failing', async () => {
    // First run: test-a passes, test-b fails
    await s.domain.saveTestRun({
      results: [
        { testName: 'test-a', domain: 'Cart', status: 'pass', trace: [] },
        { testName: 'test-b', domain: 'Cart', status: 'fail', trace: [] },
      ],
    })

    // Second run: test-a fails, test-b passes
    await s.domain.saveTestRun({
      results: [
        { testName: 'test-a', domain: 'Cart', status: 'fail', trace: [] },
        { testName: 'test-b', domain: 'Cart', status: 'pass', trace: [] },
      ],
    })

    await s.domain.callTool({ tool: 'get_run_diff' })

    await s.domain.toolResultContains({ path: 'newlyFailing', expected: ['test-a'] })
    await s.domain.toolResultContains({ path: 'newlyPassing', expected: ['test-b'] })
  })

  it('returns error when fewer than 2 runs exist', async () => {
    await s.domain.callTool({ tool: 'get_run_diff' })

    await s.domain.toolResultIsError({ substring: 'Need at least 2' })
  })
})
