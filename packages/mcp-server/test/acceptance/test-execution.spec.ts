import { describe, it, beforeEach, afterEach } from 'vitest'
import { suite, _resetRegistry, _registerAdapter } from 'aver'
import { averMcp } from './domains/aver-mcp'
import { averMcpAdapter } from './adapters/aver-mcp.direct'

describe('MCP Test Execution (acceptance)', () => {
  const s = suite(averMcp)

  beforeEach(async () => {
    _resetRegistry()
    _registerAdapter(averMcpAdapter)
    await s._setupForTest()
  })

  afterEach(async () => {
    await s._teardownForTest()
  })

  it('retrieves failure details after saving a run with failures', async () => {
    await s.domain.saveTestRun({
      results: [
        { testName: 'passes', domain: 'Cart', status: 'pass', trace: [] },
        { testName: 'fails', domain: 'Cart', status: 'fail', trace: [
          { kind: 'assertion', name: 'isEmpty', status: 'fail', error: 'not empty' },
        ]},
      ],
    })

    await s.domain.callTool({ tool: 'get_failure_details' })

    await s.domain.toolResultContains({ path: 'failures.0.testName', expected: 'fails' })
    await s.domain.toolResultContains({ path: 'failures.0.domain', expected: 'Cart' })
  })

  it('retrieves test trace by name', async () => {
    await s.domain.saveTestRun({
      results: [
        { testName: 'my-test', domain: 'Cart', status: 'pass', trace: [
          { kind: 'action', name: 'addItem', status: 'pass' },
          { kind: 'query', name: 'total', status: 'pass' },
        ]},
      ],
    })

    await s.domain.callTool({ tool: 'get_test_trace', input: { testName: 'my-test' } })

    await s.domain.toolResultContains({ path: 'testName', expected: 'my-test' })
    await s.domain.toolResultContains({ path: 'status', expected: 'pass' })
  })

  it('returns null trace for unknown test', async () => {
    await s.domain.saveTestRun({ results: [] })

    await s.domain.callTool({ tool: 'get_test_trace', input: { testName: 'nonexistent' } })

    await s.domain.toolResultIsError({ substring: 'not found' })
  })
})
