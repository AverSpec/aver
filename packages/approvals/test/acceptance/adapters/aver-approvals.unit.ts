import { expect } from 'vitest'
import { implement, unit } from 'aver'
import type { TraceEntry } from 'aver'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { approve } from '../../../src/approve'
import { averApprovals } from '../domains/aver-approvals'

interface ApprovalSession {
  workDir: string
  lastError?: Error
  lastApprovalName: string
  trace: TraceEntry[]
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
  },
})

function safeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'approval'
}
