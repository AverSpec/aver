import { describe, beforeEach, afterEach } from 'vitest'
import { suite } from '@aver/core'
import { averApprovals } from './domains/aver-approvals'
import { averApprovalsAdapter } from './adapters/aver-approvals.unit'

describe('Approval testing', () => {
  const { test } = suite(averApprovals, averApprovalsAdapter)

  let savedApprove: string | undefined
  beforeEach(() => {
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

  describe('baseline management', () => {
    test('fails when baseline is missing', async ({ when, then }) => {
      await when.approveValue({ value: { count: 1 } })
      await then.mismatchDetected()
      await then.baselineMissing()
      await then.diffContains({ text: 'Baseline missing' })
    })

    test('creates baseline when approve mode is on', async ({ given, when, then }) => {
      await given.setApproveMode()
      await when.approveValue({ value: { count: 2 } })
      await then.noError()
      await then.baselineCreated()
    })

    test('passes when approved matches received', async ({ given, when, then }) => {
      await given.setApproveMode()
      await when.approveValue({ value: { count: 3 } })
      await given.clearApproveMode()
      await when.approveValue({ value: { count: 3 } })
      await then.matchPassed()
      await then.noError()
    })
  })

  describe('mismatch detection', () => {
    test('detects mismatch and generates diff', async ({ given, when, then }) => {
      await given.setApproveMode()
      await when.approveValue({ value: { count: 5 } })
      await given.clearApproveMode()
      await when.approveValue({ value: { count: 99 } })
      await then.mismatchDetected()
      await then.diffContains({ text: '+' })
      await then.diffContains({ text: '-' })
    })

    test('updates baseline when approve mode is on after mismatch', async ({ given, when, then }) => {
      await given.setApproveMode()
      await when.approveValue({ value: { old: true } })
      await when.approveValue({ value: { new: true } })
      await then.noError()
      await then.baselineCreated()
    })
  })

  describe('multiple approvals in one test', () => {
    test('handles multiple named approvals independently', async ({ given, when, then }) => {
      await given.setApproveMode()
      await when.approveValue({ value: 'first', name: 'alpha' })
      await when.approveValue({ value: 'second', name: 'beta' })
      await then.noError()
      await then.baselineCreated()
    })
  })

  describe('trace integration', () => {
    test('records attachments on approval failure', async ({ when, then }) => {
      await when.approveValue({ value: { data: 1 } })
      await then.mismatchDetected()
      await then.attachmentsRecorded({ minCount: 2 })
    })

    test('records pass status when baseline created', async ({ given, when, then }) => {
      await given.setApproveMode()
      await when.approveValue({ value: { data: 2 } })
      await then.traceEntryHasStatus({ name: 'approval-artifacts', status: 'pass' })
    })

    test('records fail status on mismatch', async ({ when, then }) => {
      await when.approveValue({ value: { data: 3 } })
      await then.traceEntryHasStatus({ name: 'approval-artifacts', status: 'fail' })
    })
  })

  describe('serializers', () => {
    test('auto-detects json for objects', async ({ given, when, then }) => {
      await given.setApproveMode()
      await when.approveValue({ value: { key: 'val' } })
      await then.noError()
      await then.baselineCreated()
    })

    test('auto-detects text for strings', async ({ given, when, then }) => {
      await given.setApproveMode()
      await when.approveValue({ value: 'plain text' })
      await then.noError()
      await then.baselineCreated()
    })
  })

  // --- Serializer auto-detection ---

  describe('serializer auto-detection', () => {
    test('null values use text serializer', async ({ given, when, then }) => {
      await given.setApproveMode()
      await when.approveValue({ value: null, name: 'null-value' })
      await then.baselineCreated()
      await then.noError()
      await given.clearApproveMode()
    })

    test('arrays use JSON serializer', async ({ given, when, then }) => {
      await given.setApproveMode()
      await when.approveValue({ value: [1, 2, 3], name: 'array-value' })
      await then.baselineCreated()
      await then.noError()
      await given.clearApproveMode()
    })

    test('primitive numbers use text serializer', async ({ given, when, then }) => {
      await given.setApproveMode()
      await when.approveValue({ value: 42, name: 'number-value' })
      await then.baselineCreated()
      await then.noError()
      await given.clearApproveMode()
    })

    test('primitive strings use text serializer', async ({ given, when, then }) => {
      await given.setApproveMode()
      await when.approveValue({ value: 'hello world', name: 'string-value' })
      await then.baselineCreated()
      await then.noError()
      await given.clearApproveMode()
    })
  })

  // --- AVER_APPROVE='true' variant ---

  describe('approve mode variants', () => {
    test('AVER_APPROVE=true (string) creates baseline', async ({ given, when, then }) => {
      await given.setApproveModeTrue()
      await when.approveValue({ value: { key: 'value' }, name: 'true-variant' })
      await then.baselineCreated()
      await then.noError()
      await given.clearApproveMode()
    })

    test('approve mode with matching content is a no-op', async ({ given, when, then }) => {
      // First: create a baseline
      await given.setApproveMode()
      await when.approveValue({ value: { key: 'same' }, name: 'match-fast-path' })
      await then.baselineCreated()

      // Second: approve same value again — should be a no-op (no error, no file write)
      await when.approveValue({ value: { key: 'same' }, name: 'match-fast-path' })
      await then.noError()
      await given.clearApproveMode()
    })
  })

  // --- safeName edge cases ---

  describe('safeName edge cases', () => {
    test('approval with very long name truncates the filename', async ({ given, when, then }) => {
      const longName = 'a'.repeat(100)
      await given.setApproveMode()
      await when.approveValue({ value: 'data', name: longName })
      await then.baselineCreated()
      await then.noError()
      await given.clearApproveMode()
    })

    test('approval with special characters in name produces safe filename', async ({ given, when, then }) => {
      await given.setApproveMode()
      await when.approveValue({ value: 'data', name: 'test@#$%^&*()!' })
      await then.baselineCreated()
      await then.noError()
      await given.clearApproveMode()
    })
  })

  describe('visual approvals', () => {
    test('fails when visual baseline is missing', async ({ given, when, then }) => {
      await given.provideScreenshotter({ behavior: 'match' })
      await when.approveVisual({ name: 'screenshot' })
      await then.visualBaselineMissing()
      await then.mismatchDetected()
    })

    test('creates visual baseline when approve mode is on', async ({ given, when, then }) => {
      await given.provideScreenshotter({ behavior: 'match' })
      await given.setApproveMode()
      await when.approveVisual({ name: 'screenshot' })
      await then.noError()
      await then.visualBaselineCreated()
    })

    test('passes when visual baseline matches', async ({ given, when, then }) => {
      await given.provideScreenshotter({ behavior: 'match' })
      await given.setApproveMode()
      await when.approveVisual({ name: 'screenshot' })
      await given.clearApproveMode()
      await when.approveVisual({ name: 'screenshot' })
      await then.visualMatchPassed()
      await then.noError()
    })

    test('detects visual mismatch and generates diff', async ({ given, when, then }) => {
      await given.provideScreenshotter({ behavior: 'differ' })
      await given.setApproveMode()
      await when.approveVisual({ name: 'screenshot' })
      await given.clearApproveMode()
      await when.approveVisual({ name: 'screenshot' })
      await then.visualMismatchDetected()
      await then.visualDiffGenerated()
    })

    test('handles different image dimensions', async ({ given, when, then }) => {
      await given.provideScreenshotter({ behavior: 'dimension-mismatch' })
      await given.setApproveMode()
      await when.approveVisual({ name: 'screenshot' })
      await given.clearApproveMode()
      await when.approveVisual({ name: 'screenshot' })
      await then.visualMismatchDetected()
      await then.visualDiffGenerated()
    })

    test('skips with warning when no screenshotter available', async ({ given, when, then }) => {
      await given.removeScreenshotter()
      await when.approveVisual({ name: 'screenshot' })
      await then.screenshotterSkipWarned()
      await then.noError()
    })

    test('supports region-based visual approval', async ({ given, when, then }) => {
      await given.provideScreenshotter({ behavior: 'match' })
      await given.setApproveMode()
      await when.approveVisual({ name: 'header-region', region: 'header' })
      await then.noError()
      await then.visualBaselineCreated()
    })
  })
})
