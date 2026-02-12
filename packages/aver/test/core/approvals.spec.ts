import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { approve } from '../../src/approvals/approve'
import { runWithApprovalContext } from '../../src/approvals/context'

describe('approve()', () => {
  const originalExpect = (globalThis as any).expect
  let workDir = ''

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'aver-approve-'))
    ;(globalThis as any).expect = {
      getState: () => ({
        testPath: join(workDir, 'tests', 'example.spec.ts'),
        currentTestName: 'adds items to cart',
      }),
    }
  })

  afterEach(() => {
    ;(globalThis as any).expect = originalExpect
    delete process.env.AVER_APPROVE
    if (workDir) rmSync(workDir, { recursive: true, force: true })
  })

  it('fails when baseline is missing and writes received + diff', async () => {
    let error: Error | undefined
    await approve({ count: 1 }).catch(e => { error = e })

    const baseDir = join(workDir, 'tests', '__approvals__', 'adds-items-to-cart')
    const received = join(baseDir, 'approval.received.json')
    const diff = join(baseDir, 'approval.diff.txt')
    const approved = join(baseDir, 'approval.approved.json')

    expect(existsSync(received)).toBe(true)
    expect(existsSync(diff)).toBe(true)
    expect(existsSync(approved)).toBe(false)
    expect(error?.message).toContain('Approval baseline missing')
  })

  it('creates baseline when AVER_APPROVE=1', async () => {
    process.env.AVER_APPROVE = '1'
    await approve({ count: 2 })

    const baseDir = join(workDir, 'tests', '__approvals__', 'adds-items-to-cart')
    const approved = join(baseDir, 'approval.approved.json')
    expect(existsSync(approved)).toBe(true)
  })

  it('writes diff on mismatch and throws', async () => {
    process.env.AVER_APPROVE = '1'
    await approve({ count: 3 })
    delete process.env.AVER_APPROVE

    let error: Error | undefined
    await approve({ count: 4 }).catch(e => { error = e })

    const baseDir = join(workDir, 'tests', '__approvals__', 'adds-items-to-cart')
    const diff = join(baseDir, 'approval.diff.txt')
    expect(existsSync(diff)).toBe(true)
    expect(error?.message).toContain('Approval mismatch')
  })

  it('records attachments when approval fails', async () => {
    const trace: any[] = []
    let error: Error | undefined
    await runWithApprovalContext(
      {
        testName: 'adds items to cart',
        domainName: 'cart',
        protocolName: 'unit',
        trace,
      },
      async () => {
        await approve({ count: 1 }).catch(e => { error = e })
      },
    )

    expect(error).toBeDefined()
    const entry = trace.find(e => e.kind === 'test' && e.name === 'approval-artifacts')
    expect(entry).toBeDefined()
    expect(entry.attachments.length).toBeGreaterThan(0)
  })
})
