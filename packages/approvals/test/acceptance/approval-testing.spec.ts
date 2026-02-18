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
    test('fails when baseline is missing', async ({ act, assert }) => {
      await act.approveValue({ value: { count: 1 } })
      await assert.mismatchDetected()
      await assert.baselineMissing()
      await assert.diffContains({ text: 'Baseline missing' })
    })

    test('creates baseline when approve mode is on', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: { count: 2 } })
      await assert.noError()
      await assert.baselineCreated()
    })

    test('passes when approved matches received', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: { count: 3 } })
      await act.clearApproveMode()
      await act.approveValue({ value: { count: 3 } })
      await assert.matchPassed()
      await assert.noError()
    })
  })

  describe('mismatch detection', () => {
    test('detects mismatch and generates diff', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: { count: 5 } })
      await act.clearApproveMode()
      await act.approveValue({ value: { count: 99 } })
      await assert.mismatchDetected()
      await assert.diffContains({ text: '+' })
      await assert.diffContains({ text: '-' })
    })

    test('updates baseline when approve mode is on after mismatch', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: { old: true } })
      await act.approveValue({ value: { new: true } })
      await assert.noError()
      await assert.baselineCreated()
    })
  })

  describe('multiple approvals in one test', () => {
    test('handles multiple named approvals independently', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: 'first', name: 'alpha' })
      await act.approveValue({ value: 'second', name: 'beta' })
      await assert.noError()
      await assert.baselineCreated()
    })
  })

  describe('trace integration', () => {
    test('records attachments on approval failure', async ({ act, assert }) => {
      await act.approveValue({ value: { data: 1 } })
      await assert.mismatchDetected()
      await assert.attachmentsRecorded({ minCount: 2 })
    })

    test('records pass status when baseline created', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: { data: 2 } })
      await assert.traceEntryHasStatus({ name: 'approval-artifacts', status: 'pass' })
    })

    test('records fail status on mismatch', async ({ act, assert }) => {
      await act.approveValue({ value: { data: 3 } })
      await assert.traceEntryHasStatus({ name: 'approval-artifacts', status: 'fail' })
    })
  })

  describe('serializers', () => {
    test('auto-detects json for objects', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: { key: 'val' } })
      await assert.noError()
      await assert.baselineCreated()
    })

    test('auto-detects text for strings', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: 'plain text' })
      await assert.noError()
      await assert.baselineCreated()
    })
  })

  // --- Serializer auto-detection ---

  describe('serializer auto-detection', () => {
    test('null values use text serializer', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: null, name: 'null-value' })
      await assert.baselineCreated()
      await assert.noError()
      await act.clearApproveMode()
    })

    test('arrays use JSON serializer', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: [1, 2, 3], name: 'array-value' })
      await assert.baselineCreated()
      await assert.noError()
      await act.clearApproveMode()
    })

    test('primitive numbers use text serializer', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: 42, name: 'number-value' })
      await assert.baselineCreated()
      await assert.noError()
      await act.clearApproveMode()
    })

    test('primitive strings use text serializer', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: 'hello world', name: 'string-value' })
      await assert.baselineCreated()
      await assert.noError()
      await act.clearApproveMode()
    })
  })

  // --- AVER_APPROVE='true' variant ---

  describe('approve mode variants', () => {
    test('AVER_APPROVE=true (string) creates baseline', async ({ act, assert }) => {
      await act.setApproveModeTrue()
      await act.approveValue({ value: { key: 'value' }, name: 'true-variant' })
      await assert.baselineCreated()
      await assert.noError()
      await act.clearApproveMode()
    })

    test('approve mode with matching content is a no-op', async ({ act, assert, query }) => {
      // First: create a baseline
      await act.setApproveMode()
      await act.approveValue({ value: { key: 'same' }, name: 'match-fast-path' })
      await assert.baselineCreated()

      // Second: approve same value again — should be a no-op (no error, no file write)
      await act.approveValue({ value: { key: 'same' }, name: 'match-fast-path' })
      await assert.noError()
      await act.clearApproveMode()
    })
  })

  // --- safeName edge cases ---

  describe('safeName edge cases', () => {
    test('approval with very long name truncates the filename', async ({ act, assert }) => {
      const longName = 'a'.repeat(100)
      await act.setApproveMode()
      await act.approveValue({ value: 'data', name: longName })
      await assert.baselineCreated()
      await assert.noError()
      await act.clearApproveMode()
    })

    test('approval with special characters in name produces safe filename', async ({ act, assert }) => {
      await act.setApproveMode()
      await act.approveValue({ value: 'data', name: 'test@#$%^&*()!' })
      await assert.baselineCreated()
      await assert.noError()
      await act.clearApproveMode()
    })
  })

  describe('visual approvals', () => {
    test('fails when visual baseline is missing', async ({ act, assert }) => {
      await act.provideScreenshotter({ behavior: 'match' })
      await act.approveVisual({ name: 'screenshot' })
      await assert.visualBaselineMissing()
      await assert.mismatchDetected()
    })

    test('creates visual baseline when approve mode is on', async ({ act, assert }) => {
      await act.provideScreenshotter({ behavior: 'match' })
      await act.setApproveMode()
      await act.approveVisual({ name: 'screenshot' })
      await assert.noError()
      await assert.visualBaselineCreated()
    })

    test('passes when visual baseline matches', async ({ act, assert }) => {
      await act.provideScreenshotter({ behavior: 'match' })
      await act.setApproveMode()
      await act.approveVisual({ name: 'screenshot' })
      await act.clearApproveMode()
      await act.approveVisual({ name: 'screenshot' })
      await assert.visualMatchPassed()
      await assert.noError()
    })

    test('detects visual mismatch and generates diff', async ({ act, assert }) => {
      await act.provideScreenshotter({ behavior: 'differ' })
      await act.setApproveMode()
      await act.approveVisual({ name: 'screenshot' })
      await act.clearApproveMode()
      await act.approveVisual({ name: 'screenshot' })
      await assert.visualMismatchDetected()
      await assert.visualDiffGenerated()
    })

    test('handles different image dimensions', async ({ act, assert }) => {
      await act.provideScreenshotter({ behavior: 'dimension-mismatch' })
      await act.setApproveMode()
      await act.approveVisual({ name: 'screenshot' })
      await act.clearApproveMode()
      await act.approveVisual({ name: 'screenshot' })
      await assert.visualMismatchDetected()
      await assert.visualDiffGenerated()
    })

    test('skips with warning when no screenshotter available', async ({ act, assert }) => {
      await act.removeScreenshotter()
      await act.approveVisual({ name: 'screenshot' })
      await assert.screenshotterSkipWarned()
      await assert.noError()
    })

    test('supports region-based visual approval', async ({ act, assert }) => {
      await act.provideScreenshotter({ behavior: 'match' })
      await act.setApproveMode()
      await act.approveVisual({ name: 'header-region', region: 'header' })
      await assert.noError()
      await assert.visualBaselineCreated()
    })
  })
})
