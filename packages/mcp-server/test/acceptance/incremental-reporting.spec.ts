import { describe, beforeEach } from 'vitest'
import { suite, registerAdapter, resetRegistry } from '@aver/core'
import { averMcp } from './domains/aver-mcp'
import { averMcpAdapter } from './adapters/aver-mcp.unit'
import { averMcpIntegrationAdapter } from './adapters/aver-mcp.mcp'

registerAdapter(averMcpAdapter)
registerAdapter(averMcpIntegrationAdapter)

describe('MCP Incremental Reporting (acceptance)', () => {
  const { test } = suite(averMcp)

  beforeEach(() => {
    resetRegistry()
  })

  test('diffs two runs showing newly passing and newly failing', async ({ act, query }) => {
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

    const diff = await query.runDiff()
    if (!diff) throw new Error('Expected diff but got null')
    if (diff.newlyFailing[0] !== 'test-a')
      throw new Error(`Expected newlyFailing to contain 'test-a', got ${JSON.stringify(diff.newlyFailing)}`)
    if (diff.newlyPassing[0] !== 'test-b')
      throw new Error(`Expected newlyPassing to contain 'test-b', got ${JSON.stringify(diff.newlyPassing)}`)
  })

  test('returns null when fewer than 2 runs exist', async ({ query }) => {
    const diff = await query.runDiff()
    if (diff !== null) throw new Error(`Expected null but got ${JSON.stringify(diff)}`)
  })
})
