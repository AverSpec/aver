import { expect } from 'vitest'
import { implement, unit, runWithTestContext } from '@averspec/core'
import type { TraceEntry, Screenshotter } from '@averspec/core'
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { PNG } from 'pngjs'
import { approve } from '../../../src/approve'
import { safeName } from '../../../src/paths'
import { averApprovals } from '../domains/aver-approvals'

interface ApprovalSession {
  workDir: string
  lastError?: Error
  lastApprovalName: string
  trace: TraceEntry[]
  screenshotter?: Screenshotter

}

function createMockPng(width: number, height: number, color: [number, number, number, number]): Buffer {
  const png = new PNG({ width, height })
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2
      png.data[idx] = color[0]
      png.data[idx + 1] = color[1]
      png.data[idx + 2] = color[2]
      png.data[idx + 3] = color[3]
    }
  }
  return PNG.sync.write(png)
}

function createMockScreenshotter(behavior: 'match' | 'differ' | 'dimension-mismatch'): Screenshotter {
  let callCount = 0
  return {
    regions: { 'header': '.header' },
    async capture(outputPath) {
      callCount++
      let buf: Buffer
      switch (behavior) {
        case 'match':
          buf = createMockPng(100, 100, [255, 0, 0, 255])
          break
        case 'differ':
          buf = callCount <= 1
            ? createMockPng(100, 100, [255, 0, 0, 255])
            : createMockPng(100, 100, [0, 0, 255, 255])
          break
        case 'dimension-mismatch':
          buf = callCount <= 1
            ? createMockPng(100, 100, [255, 0, 0, 255])
            : createMockPng(200, 200, [255, 0, 0, 255])
          break
      }
      writeFileSync(outputPath, buf)
    },
  }
}

function getVisualApprovalDir(): string | undefined {
  // Use vitest's state directly for the visual approval dir lookup.
  // The approve.visual() call reads testPath/testName from RunningTestContext,
  // which the approveVisual handler populates from vitest's expect.getState().
  // Assertions need to look in the same directory, so we read the same source.
  const state = (globalThis as any).expect?.getState?.()
  const testPath = state?.testPath
  if (!testPath) return undefined
  const testName = state?.currentTestName ?? 'approval-test'
  return join(dirname(testPath), '__approvals__', safeName(testName))
}

export const averApprovalsAdapter = implement(averApprovals, {
  protocol: unit<ApprovalSession>(() => {
    const workDir = mkdtempSync(join(tmpdir(), 'aver-approvals-test-'))
    return { workDir, lastApprovalName: 'approval', trace: [] }
  }),

  actions: {
    approveValue: async (session, { value, name }) => {
      session.lastError = undefined
      session.lastApprovalName = name ?? 'approval'
      try {
        const context = {
          testName: 'approval-test',
          domainName: 'AverApprovals',
          protocolName: 'unit',
          trace: session.trace,
        }
        await runWithTestContext(context, async () => {
          await approve(value, {
            name,
            filePath: join(session.workDir, 'tests', 'test.spec.ts'),
            testName: 'approval-test',
          })
        })
      } catch (e: any) {
        session.lastError = e
      }
    },

    setApproveMode: async () => {
      process.env.AVER_APPROVE = '1'
    },

    setApproveModeTrue: async () => {
      process.env.AVER_APPROVE = 'true'
    },

    clearApproveMode: async () => {
      delete process.env.AVER_APPROVE
    },

    approveVisual: async (session, { name, region }) => {
      session.lastError = undefined
      session.lastApprovalName = name

      try {
        const state = (globalThis as any).expect?.getState?.()
        const testPath = state?.testPath
        const testName = state?.currentTestName ?? 'approval-test'
        const context = {
          testName,
          testPath,
          domainName: 'AverApprovals',
          protocolName: 'unit',
          trace: session.trace,
          extensions: {
            screenshotter: session.screenshotter,
          },
        }

        await runWithTestContext(context, async () => {
          await approve.visual(region ? { name, region } : name)
        })
      } catch (e: any) {
        session.lastError = e
      }
    },

    provideScreenshotter: async (session, { behavior }) => {
      session.screenshotter = createMockScreenshotter(behavior)
    },

    removeScreenshotter: async (session) => {
      session.screenshotter = undefined
    },
  },

  queries: {
    approvedFileExists: async (session) => {
      const dir = join(session.workDir, 'tests', '__approvals__', 'approval-test')
      for (const ext of ['json', 'txt']) {
        if (existsSync(join(dir, `${safeName(session.lastApprovalName)}.approved.${ext}`))) {
          return true
        }
      }
      return false
    },

    receivedFileContents: async (session) => {
      const dir = join(session.workDir, 'tests', '__approvals__', 'approval-test')
      for (const ext of ['json', 'txt']) {
        const path = join(dir, `${safeName(session.lastApprovalName)}.received.${ext}`)
        if (existsSync(path)) return readFileSync(path, 'utf-8')
      }
      return ''
    },

    diffFileContents: async (session) => {
      const dir = join(session.workDir, 'tests', '__approvals__', 'approval-test')
      const path = join(dir, `${safeName(session.lastApprovalName)}.diff.txt`)
      return existsSync(path) ? readFileSync(path, 'utf-8') : ''
    },

    traceAttachments: async (session) => {
      const trace = session.trace ?? []
      const entries = trace.filter(
        (e: TraceEntry) => e.kind === 'test' && e.attachments && e.attachments.length > 0,
      )
      return entries.flatMap((e: TraceEntry) =>
        (e.attachments ?? []).map(a => ({ name: a.name, path: a.path })),
      )
    },

    lastError: async (session) => {
      return session.lastError?.message
    },

    approvedImageExists: async (session) => {
      const dir = getVisualApprovalDir()
      if (!dir) return false
      return existsSync(join(dir, `${safeName(session.lastApprovalName)}.approved.png`))
    },

    receivedImageExists: async (session) => {
      const dir = getVisualApprovalDir()
      if (!dir) return false
      return existsSync(join(dir, `${safeName(session.lastApprovalName)}.received.png`))
    },

    diffImageExists: async (session) => {
      const dir = getVisualApprovalDir()
      if (!dir) return false
      return existsSync(join(dir, `${safeName(session.lastApprovalName)}.diff.png`))
    },

    lastWarning: async () => {
      return undefined
    },
  },

  assertions: {
    baselineCreated: async (session) => {
      const dir = join(session.workDir, 'tests', '__approvals__', 'approval-test')
      let found = false
      for (const ext of ['json', 'txt']) {
        if (existsSync(join(dir, `${safeName(session.lastApprovalName)}.approved.${ext}`))) {
          found = true
          break
        }
      }
      if (!found) throw new Error('Expected approval baseline to be created')
    },

    baselineMissing: async (session) => {
      if (!session.lastError?.message?.includes('Approval baseline missing'))
        throw new Error(`Expected "Approval baseline missing" error but got: ${session.lastError?.message ?? 'no error'}`)
    },

    mismatchDetected: async (session) => {
      if (!session.lastError) throw new Error('Expected a mismatch error')
    },

    matchPassed: async (session) => {
      if (session.lastError)
        throw new Error(`Expected no error but got: ${session.lastError.message}`)
    },

    diffContains: async (session, { text }) => {
      const dir = join(session.workDir, 'tests', '__approvals__', 'approval-test')
      const path = join(dir, `${safeName(session.lastApprovalName)}.diff.txt`)
      if (existsSync(path)) {
        const contents = readFileSync(path, 'utf-8')
        if (!contents.includes(text))
          throw new Error(`Expected diff to contain "${text}"`)
        return
      }
      if (!(session.lastError?.message ?? '').includes(text))
        throw new Error(`Expected error message to contain "${text}"`)
    },

    attachmentsRecorded: async (session, { minCount }) => {
      const trace = session.trace ?? []
      const entries = trace.filter(
        (e: TraceEntry) => e.kind === 'test' && e.attachments && e.attachments.length > 0,
      )
      const totalAttachments = entries.reduce((sum, e: TraceEntry) => sum + (e.attachments?.length ?? 0), 0)
      if (totalAttachments < minCount)
        throw new Error(`Expected at least ${minCount} attachments but found ${totalAttachments}`)
    },

    traceEntryHasStatus: async (session, { name, status }) => {
      const trace = session.trace ?? []
      const entry = trace.find((e: TraceEntry) => e.kind === 'test' && e.name === name && e.status === status)
      if (!entry)
        throw new Error(`Expected trace to contain entry with name "${name}" and status "${status}"`)
    },

    noError: async (session) => {
      if (session.lastError)
        throw new Error(`Expected no error but got: ${session.lastError.message}`)
    },

    visualBaselineCreated: async (session) => {
      const dir = getVisualApprovalDir()
      if (!dir) throw new Error('No test path available')
      if (!existsSync(join(dir, `${safeName(session.lastApprovalName)}.approved.png`)))
        throw new Error('Expected visual approval baseline to be created')
    },

    visualBaselineMissing: async (session) => {
      if (!session.lastError?.message?.includes('Visual approval baseline missing'))
        throw new Error(`Expected "Visual approval baseline missing" error but got: ${session.lastError?.message ?? 'no error'}`)
    },

    visualMismatchDetected: async (session) => {
      if (!session.lastError) throw new Error('Expected a visual mismatch error')
      if (!session.lastError.message.includes('Visual approval mismatch'))
        throw new Error(`Expected "Visual approval mismatch" error but got: ${session.lastError.message}`)
    },

    visualMatchPassed: async (session) => {
      if (session.lastError)
        throw new Error(`Expected no error but got: ${session.lastError.message}`)
    },

    visualDiffGenerated: async (session) => {
      const dir = getVisualApprovalDir()
      if (!dir) throw new Error('No test path available')
      if (!existsSync(join(dir, `${safeName(session.lastApprovalName)}.diff.png`)))
        throw new Error('Expected visual diff image to be generated')
    },

    screenshotterSkipWarned: async (session) => {
      expect(session.lastError).toBeDefined()
      expect(session.lastError?.message).toContain('requires a screenshotter extension')
    },
  },
})

