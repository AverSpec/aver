import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { approve } from '../../src/approve'

describe('approve() .received file cleanup', () => {
  let workDir: string
  let savedApprove: string | undefined

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'aver-cleanup-test-'))
    savedApprove = process.env.AVER_APPROVE
    delete process.env.AVER_APPROVE
  })

  afterEach(() => {
    if (savedApprove !== undefined) {
      process.env.AVER_APPROVE = savedApprove
    } else {
      delete process.env.AVER_APPROVE
    }
  })

  function approveOpts(overrides?: Record<string, unknown>) {
    return {
      filePath: join(workDir, 'tests', 'test.spec.ts'),
      testName: 'cleanup-test',
      ...overrides,
    }
  }

  function resolveDir() {
    return join(workDir, 'tests', '__approvals__', 'cleanup-test')
  }

  it('deletes the .received file when comparison succeeds', async () => {
    // Create baseline
    process.env.AVER_APPROVE = '1'
    await approve('hello world', approveOpts({ name: 'match' }))
    delete process.env.AVER_APPROVE

    const dir = resolveDir()
    const receivedPath = join(dir, 'match.received.txt')
    const approvedPath = join(dir, 'match.approved.txt')

    // Baseline exists; received should have been cleaned up during the approval step
    expect(existsSync(approvedPath)).toBe(true)

    // Now run a passing comparison — received should be deleted
    await approve('hello world', approveOpts({ name: 'match' }))

    expect(existsSync(receivedPath)).toBe(false)
    expect(existsSync(approvedPath)).toBe(true)
  })

  it('keeps the .received file when comparison fails', async () => {
    // Create baseline with one value
    process.env.AVER_APPROVE = '1'
    await approve('approved content', approveOpts({ name: 'mismatch' }))
    delete process.env.AVER_APPROVE

    const dir = resolveDir()
    const receivedPath = join(dir, 'mismatch.received.txt')
    const approvedPath = join(dir, 'mismatch.approved.txt')

    // Run a failing comparison — received should be kept for inspection
    await expect(
      approve('different content', approveOpts({ name: 'mismatch' })),
    ).rejects.toThrow('Approval mismatch')

    expect(existsSync(receivedPath)).toBe(true)
    expect(existsSync(approvedPath)).toBe(true)
  })

  it('does not delete .received when baseline is missing (no approved file)', async () => {
    const dir = resolveDir()
    const receivedPath = join(dir, 'no-baseline.received.txt')

    // No baseline — should throw and keep the received file
    await expect(
      approve('some content', approveOpts({ name: 'no-baseline' })),
    ).rejects.toThrow('Approval baseline missing')

    expect(existsSync(receivedPath)).toBe(true)
  })

  it('writes a new .received file on each run before comparison', async () => {
    // Create baseline
    process.env.AVER_APPROVE = '1'
    await approve('initial', approveOpts({ name: 'write-check' }))
    delete process.env.AVER_APPROVE

    const dir = resolveDir()
    const receivedPath = join(dir, 'write-check.received.txt')

    // Successful pass — received deleted
    await approve('initial', approveOpts({ name: 'write-check' }))
    expect(existsSync(receivedPath)).toBe(false)

    // Failing run — received written and kept
    await expect(
      approve('changed', approveOpts({ name: 'write-check' })),
    ).rejects.toThrow('Approval mismatch')
    expect(existsSync(receivedPath)).toBe(true)
  })

  it('manually pre-existing .received file is replaced then deleted on success', async () => {
    // Create baseline
    process.env.AVER_APPROVE = '1'
    await approve('content', approveOpts({ name: 'stale-received' }))
    delete process.env.AVER_APPROVE

    const dir = resolveDir()
    const receivedPath = join(dir, 'stale-received.received.txt')

    // Simulate a stale .received file left from a previous failure
    mkdirSync(dir, { recursive: true })
    writeFileSync(receivedPath, 'stale content from previous failure', 'utf-8')
    expect(existsSync(receivedPath)).toBe(true)

    // Successful run should overwrite and then delete the received file
    await approve('content', approveOpts({ name: 'stale-received' }))
    expect(existsSync(receivedPath)).toBe(false)
  })
})
