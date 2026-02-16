import { expect } from 'vitest'
import { implement, unit, runWithTestContext } from 'aver'
import type { TraceEntry, Screenshotter } from 'aver'
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { PNG } from 'pngjs'
import { approve } from '../../../src/approve'
import { averApprovals } from '../domains/aver-approvals'

interface ApprovalSession {
  workDir: string
  lastError?: Error
  lastApprovalName: string
  trace: TraceEntry[]
  screenshotter?: Screenshotter
  lastWarning?: string
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
        await approve(value, {
          name,
          filePath: join(session.workDir, 'tests', 'test.spec.ts'),
          testName: 'approval-test',
        })
      } catch (e: any) {
        session.lastError = e
      }
    },

    setApproveMode: async () => {
      process.env.AVER_APPROVE = '1'
    },

    clearApproveMode: async () => {
      delete process.env.AVER_APPROVE
    },

    approveVisual: async (session, { name, region }) => {
      session.lastError = undefined
      session.lastWarning = undefined
      session.lastApprovalName = name

      // Capture console.warn to detect skip warnings
      const originalWarn = console.warn
      let capturedWarning: string | undefined
      console.warn = (...args: any[]) => { capturedWarning = args.join(' ') }

      try {
        const context = {
          testName: 'approval-test',
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
      } finally {
        console.warn = originalWarn
        session.lastWarning = capturedWarning
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

    lastWarning: async (session) => {
      return session.lastWarning
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
      expect(found).toBe(true)
    },

    baselineMissing: async (session) => {
      expect(session.lastError?.message).toContain('Approval baseline missing')
    },

    mismatchDetected: async (session) => {
      expect(session.lastError).toBeDefined()
    },

    matchPassed: async (session) => {
      expect(session.lastError).toBeUndefined()
    },

    diffContains: async (session, { text }) => {
      const dir = join(session.workDir, 'tests', '__approvals__', 'approval-test')
      const path = join(dir, `${safeName(session.lastApprovalName)}.diff.txt`)
      if (existsSync(path)) {
        const contents = readFileSync(path, 'utf-8')
        expect(contents).toContain(text)
        return
      }
      expect(session.lastError?.message ?? '').toContain(text)
    },

    attachmentsRecorded: async (session, { minCount }) => {
      const dir = join(session.workDir, 'tests', '__approvals__', 'approval-test')
      const received = existsSync(join(dir, `${safeName(session.lastApprovalName)}.received.json`))
      const diff = existsSync(join(dir, `${safeName(session.lastApprovalName)}.diff.txt`))
      expect(received || diff).toBe(true)
    },

    traceEntryHasStatus: async (session, { name, status }) => {
      if (status === 'fail') {
        expect(session.lastError).toBeDefined()
      } else {
        expect(session.lastError).toBeUndefined()
      }
    },

    noError: async (session) => {
      expect(session.lastError).toBeUndefined()
    },

    visualBaselineCreated: async (session) => {
      const dir = getVisualApprovalDir()
      if (!dir) throw new Error('No test path available')
      expect(existsSync(join(dir, `${safeName(session.lastApprovalName)}.approved.png`))).toBe(true)
    },

    visualBaselineMissing: async (session) => {
      expect(session.lastError?.message).toContain('Visual approval baseline missing')
    },

    visualMismatchDetected: async (session) => {
      expect(session.lastError).toBeDefined()
      expect(session.lastError?.message).toContain('Visual approval mismatch')
    },

    visualMatchPassed: async (session) => {
      expect(session.lastError).toBeUndefined()
    },

    visualDiffGenerated: async (session) => {
      const dir = getVisualApprovalDir()
      if (!dir) throw new Error('No test path available')
      expect(existsSync(join(dir, `${safeName(session.lastApprovalName)}.diff.png`))).toBe(true)
    },

    screenshotterSkipWarned: async (session) => {
      expect(session.lastWarning).toBeDefined()
      expect(session.lastWarning).toContain('approve.visual() skipped')
    },
  },
})

function safeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'approval'
}
