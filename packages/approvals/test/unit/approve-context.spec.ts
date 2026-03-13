import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { approve } from '../../src/approve'
import { runWithTestContext } from '@aver/core'

describe('approve() reads testPath from RunningTestContext', () => {
  let workDir: string
  let savedApprove: string | undefined

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'aver-ctx-test-'))
    savedApprove = process.env.AVER_APPROVE
    process.env.AVER_APPROVE = '1'
  })

  afterEach(() => {
    if (savedApprove !== undefined) {
      process.env.AVER_APPROVE = savedApprove
    } else {
      delete process.env.AVER_APPROVE
    }
  })

  it('uses testPath and testName from RunningTestContext', async () => {
    const fakePath = join(workDir, 'tests', 'fake.spec.ts')
    const fakeTest = 'context-driven-test'

    await runWithTestContext(
      {
        testName: fakeTest,
        testPath: fakePath,
        domainName: 'test-domain',
        protocolName: 'test-protocol',
        trace: [],
        extensions: {},
      },
      async () => {
        // approve() should pick up testPath and testName from the context
        // without needing explicit options
        await approve('hello', { name: 'ctx-test' })
      },
    )
  })

  it('explicit options override context values', async () => {
    const contextPath = join(workDir, 'tests', 'context.spec.ts')
    const explicitPath = join(workDir, 'tests', 'explicit.spec.ts')

    await runWithTestContext(
      {
        testName: 'context-name',
        testPath: contextPath,
        domainName: 'test-domain',
        protocolName: 'test-protocol',
        trace: [],
        extensions: {},
      },
      async () => {
        // Explicit options should take precedence over context
        await approve('hello', {
          name: 'override-test',
          filePath: explicitPath,
          testName: 'explicit-name',
        })
      },
    )
  })

  it('throws when no context and no explicit options', async () => {
    // Outside any RunningTestContext, with no options
    await expect(approve('hello')).rejects.toThrow(
      'approve() could not determine test file path',
    )
  })
})
