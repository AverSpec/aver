import { describe, beforeEach, expect } from 'vitest'
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

  test('diffs two runs showing newly passing and newly failing', async ({ given, query }) => {
    // First run: test-a passes, test-b fails
    await given.saveTestRun({
      results: [
        { testName: 'test-a', domain: 'Cart', status: 'pass', trace: [] },
        { testName: 'test-b', domain: 'Cart', status: 'fail', trace: [] },
      ],
    })

    // Second run: test-a fails, test-b passes
    await given.saveTestRun({
      results: [
        { testName: 'test-a', domain: 'Cart', status: 'fail', trace: [] },
        { testName: 'test-b', domain: 'Cart', status: 'pass', trace: [] },
      ],
    })

    const diff = await query.runDiff()
    // TODO: consider adding domain assertion for run diff results
    expect(diff).not.toBeNull()
    expect(diff!.newlyFailing[0]).toBe('test-a')
    expect(diff!.newlyPassing[0]).toBe('test-b')
  })

  test('returns null when fewer than 2 runs exist', async ({ query }) => {
    const diff = await query.runDiff()
    // TODO: consider adding domain assertion for null run diff
    expect(diff).toBeNull()
  })
})
