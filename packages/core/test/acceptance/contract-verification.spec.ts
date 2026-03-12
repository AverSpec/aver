import { describe } from 'vitest'
import { suite } from '../../src/index'
import { contractVerification } from './domains/contract-verification.js'
import { adapter } from './adapters/contract-verification.unit.js'

describe('contract verification pipeline', () => {
  const { test } = suite(contractVerification, adapter)

  // ── AI-58: Verify contracts against traces ──

  test('matching traces pass verification', async ({ act, assert }) => {
    await act.writeContract({
      domain: 'user-auth',
      testName: 'login with valid credentials',
      spans: [
        { name: 'auth.login', attributes: { 'user.email': { kind: 'correlated', symbol: '$email' } } },
        { name: 'auth.session_created', attributes: { 'user.email': { kind: 'correlated', symbol: '$email' } } },
      ],
    })
    await act.writeTraces({
      filename: 'prod.json',
      spans: [
        { traceId: 't1', spanId: 's1', name: 'auth.login', attributes: { 'user.email': 'alice@co.com' } },
        { traceId: 't1', spanId: 's2', name: 'auth.session_created', attributes: { 'user.email': 'alice@co.com' } },
      ],
    })

    await act.verify({})
    await assert.passes()
    await assert.domainReported({ domain: 'user-auth' })
  })

  test('correlation violation detected when symbol values diverge', async ({ act, assert }) => {
    await act.writeContract({
      domain: 'user-auth',
      testName: 'login test',
      spans: [
        { name: 'auth.login', attributes: { 'user.email': { kind: 'correlated', symbol: '$email' } } },
        { name: 'auth.session_created', attributes: { 'user.email': { kind: 'correlated', symbol: '$email' } } },
      ],
    })
    await act.writeTraces({
      filename: 'drift.json',
      spans: [
        { traceId: 't1', spanId: 's1', name: 'auth.login', attributes: { 'user.email': 'alice@co.com' } },
        { traceId: 't1', spanId: 's2', name: 'auth.session_created', attributes: { 'user.email': 'bob@co.com' } },
      ],
    })

    await act.verify({ verbose: true })
    await assert.fails()
    await assert.violationReported({ kind: 'correlation-violation' })
    await assert.outputContains({ text: '$email' })
  })

  test('missing span detected when production trace lacks expected telemetry', async ({ act, assert }) => {
    await act.writeContract({
      domain: 'checkout',
      testName: 'process payment',
      spans: [
        { name: 'checkout.start', attributes: {} },
        { name: 'payment.charge', attributes: { 'payment.amount': { kind: 'literal', value: 100 } } },
      ],
    })
    await act.writeTraces({
      filename: 'missing.json',
      spans: [{ traceId: 't1', spanId: 's1', name: 'checkout.start' }],
    })

    await act.verify({ verbose: true })
    await assert.fails()
    await assert.violationReported({ kind: 'missing-span' })
    await assert.outputContains({ text: 'payment.charge' })
  })

  test('literal mismatch detected when attribute value drifts', async ({ act, assert }) => {
    await act.writeContract({
      domain: 'orders',
      testName: 'cancel order',
      spans: [
        { name: 'order.cancel', attributes: { 'order.status': { kind: 'literal', value: 'cancelled' } } },
      ],
    })
    await act.writeTraces({
      filename: 'literal-drift.json',
      spans: [
        { traceId: 't1', spanId: 's1', name: 'order.cancel', attributes: { 'order.status': 'canceled' } },
      ],
    })

    await act.verify({ verbose: true })
    await assert.fails()
    await assert.violationReported({ kind: 'literal-mismatch' })
    await assert.outputContains({ text: '"cancelled"' })
    await assert.outputContains({ text: '"canceled"' })
  })

  // ── AI-58: Multiple domains ──

  test('multiple domains verified independently', async ({ act, assert }) => {
    await act.writeContract({
      domain: 'auth',
      testName: 'login',
      spans: [{ name: 'auth.login', attributes: { 'user.role': { kind: 'literal', value: 'admin' } } }],
    })
    await act.writeContract({
      domain: 'billing',
      testName: 'charge',
      spans: [{ name: 'billing.charge', attributes: { amount: { kind: 'literal', value: 50 } } }],
    })
    await act.writeTraces({
      filename: 'multi.json',
      spans: [
        { traceId: 't1', spanId: 's1', name: 'auth.login', attributes: { 'user.role': 'admin' } },
        { traceId: 't2', spanId: 's2', name: 'billing.charge', attributes: { amount: 50 } },
      ],
    })

    await act.verify({})
    await assert.passes()
    await assert.domainReported({ domain: 'auth' })
    await assert.domainReported({ domain: 'billing' })
    await assert.outputContains({ text: '2 domains' })
  })

  // ── AI-60: Single contract ──

  test('--contract narrows verification to a single file', async ({ act, query, assert }) => {
    await act.writeContract({
      domain: 'auth',
      testName: 'login',
      spans: [{ name: 'auth.login', attributes: {} }],
    })
    await act.writeContract({
      domain: 'auth',
      testName: 'logout',
      spans: [{ name: 'auth.logout', attributes: {} }],
    })
    await act.writeTraces({
      filename: 'single.json',
      spans: [{ traceId: 't1', spanId: 's1', name: 'auth.login' }],
    })

    const loginPath = await query.contractPath({ domain: 'auth', testName: 'login' })
    await act.verify({ contractPath: loginPath })
    await assert.passes()
    await assert.outputContains({ text: 'login' })
    await assert.outputExcludes({ text: 'logout' })
  })

  // ── Error handling ──

  test('errors when --traces is not provided', async ({ act, assert }) => {
    await act.verify({})
    await assert.fails()
    await assert.outputContains({ text: '--traces' })
  })

  test('errors when trace file does not exist', async ({ act, assert }) => {
    await act.verify({ tracesPath: '/tmp/nonexistent-trace-file.json' })
    await assert.fails()
    await assert.outputContains({ text: 'Failed to read traces' })
  })

  test('errors when no contracts found in directory', async ({ act, assert }) => {
    await act.writeTraces({
      filename: 'orphan.json',
      spans: [{ traceId: 't1', spanId: 's1', name: 'some.span' }],
    })
    await act.verify({})
    await assert.fails()
    await assert.outputContains({ text: 'No contracts found' })
  })

  test('errors when --contract file does not exist', async ({ act, assert }) => {
    await act.writeTraces({
      filename: 'ok.json',
      spans: [{ traceId: 't1', spanId: 's1', name: 'some.span' }],
    })
    await act.verify({ contractPath: '/tmp/nonexistent-contract.json' })
    await assert.fails()
    await assert.outputContains({ text: 'Failed to read contract' })
  })

  // ── AI-59: Verbose output ──

  test('verbose includes both summary and violation details', async ({ act, assert }) => {
    await act.writeContract({
      domain: 'signup',
      testName: 'test',
      spans: [{ name: 'user.signup', attributes: { 'user.email': { kind: 'literal', value: 'right@test.com' } } }],
    })
    await act.writeTraces({
      filename: 'wrong.json',
      spans: [{ traceId: 't1', spanId: 's1', name: 'user.signup', attributes: { 'user.email': 'wrong@test.com' } }],
    })
    await act.verify({ verbose: true })
    await assert.fails()
    await assert.domainReported({ domain: 'signup' })
    await assert.outputContains({ text: 'Violation Details' })
  })

  test('verbose truncates trace IDs after 3', async ({ act, assert }) => {
    // Write traces with 5 separate traces, each missing a required span
    await act.writeContract({
      domain: 'trunc',
      testName: 'test',
      spans: [
        { name: 'anchor.span', attributes: {} },
        { name: 'missing.span', attributes: {} },
      ],
    })
    await act.writeTraces({
      filename: 'many.json',
      spans: [
        { traceId: 'trace-0', spanId: 's0', name: 'anchor.span' },
        { traceId: 'trace-1', spanId: 's1', name: 'anchor.span' },
        { traceId: 'trace-2', spanId: 's2', name: 'anchor.span' },
        { traceId: 'trace-3', spanId: 's3', name: 'anchor.span' },
        { traceId: 'trace-4', spanId: 's4', name: 'anchor.span' },
      ],
    })
    await act.verify({ verbose: true })
    await assert.fails()
    await assert.outputContains({ text: 'more' })
  })

  test('verbose with no violations omits violation section', async ({ act, assert }) => {
    await act.writeContract({
      domain: 'clean',
      testName: 'simple test',
      spans: [{ name: 'clean.op', attributes: {} }],
    })
    await act.writeTraces({
      filename: 'clean.json',
      spans: [{ traceId: 't1', spanId: 's1', name: 'clean.op' }],
    })

    await act.verify({ verbose: true })
    await assert.passes()
    await assert.outputExcludes({ text: 'Violation Details' })
  })
})
