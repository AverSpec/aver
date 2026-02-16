import { describe, beforeEach, afterEach } from 'vitest'
import { suite } from 'aver'
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
})
