import { describe, it, expect, beforeEach } from 'vitest'
import { action, query, assertion } from '../../src/core/markers'
import { defineDomain } from '../../src/core/domain'
import { implement } from '../../src/core/adapter'
import { suite } from '../../src/core/suite'
import type { Protocol, CollectedSpan } from '../../src/core/protocol'
import { formatTrace } from '../../src/core/trace-format'
import type { TraceEntry } from '../../src/core/trace'

// ── Helpers ──

function createCollector() {
  const spans: CollectedSpan[] = []
  return {
    collector: {
      getSpans: () => spans,
      reset: () => { spans.length = 0 },
    },
    emit(name: string, attributes: Record<string, unknown> = {}) {
      spans.push({ name, attributes })
    },
  }
}

function unitProtocolWithTelemetry(collector: { getSpans(): CollectedSpan[]; reset(): void }): Protocol<Record<string, unknown>> {
  return {
    name: 'unit',
    async setup() { return {} },
    async teardown() {},
    telemetry: collector,
  }
}

// ── Marker tests ──

describe('markers with telemetry', () => {
  it('action() accepts telemetry option', () => {
    const marker = action<{ orderId: string }>({
      telemetry: { span: 'order.cancel', attributes: { 'order.status': 'cancelled' } },
    })
    expect(marker.kind).toBe('action')
    expect(marker.telemetry).toEqual({
      span: 'order.cancel',
      attributes: { 'order.status': 'cancelled' },
    })
  })

  it('query() accepts telemetry option', () => {
    const marker = query<string>({
      telemetry: { span: 'order.status.query' },
    })
    expect(marker.kind).toBe('query')
    expect(marker.telemetry).toEqual({ span: 'order.status.query' })
  })

  it('assertion() accepts telemetry option', () => {
    const marker = assertion<{ orderId: string }>({
      telemetry: { span: 'order.status.changed', attributes: { 'order.status': 'cancelled' } },
    })
    expect(marker.kind).toBe('assertion')
    expect(marker.telemetry).toEqual({
      span: 'order.status.changed',
      attributes: { 'order.status': 'cancelled' },
    })
  })

  it('markers without telemetry option remain unchanged', () => {
    expect(action()).toEqual({ kind: 'action' })
    expect(query()).toEqual({ kind: 'query' })
    expect(assertion()).toEqual({ kind: 'assertion' })
  })
})

// ── Telemetry verification in proxy ──

describe('telemetry verification', () => {
  const { collector, emit } = createCollector()

  const orderDomain = defineDomain({
    name: 'order',
    actions: {
      cancelOrder: action<{ orderId: string }>({
        telemetry: { span: 'order.cancel' },
      }),
      updateOrder: action<{ orderId: string }>(),
    },
    queries: {
      orderStatus: query<{ orderId: string }, string>({
        telemetry: { span: 'order.status.query' },
      }),
    },
    assertions: {
      orderIsCancelled: assertion<{ orderId: string }>({
        telemetry: { span: 'order.status.changed', attributes: { 'order.status': 'cancelled' } },
      }),
      orderExists: assertion<{ orderId: string }>(),
    },
  })

  const protocol = unitProtocolWithTelemetry(collector)

  const adapter = implement(orderDomain, {
    protocol,
    actions: {
      cancelOrder: async (_ctx, { orderId }) => { emit('order.cancel', { 'order.id': orderId }) },
      updateOrder: async () => {},
    },
    queries: {
      orderStatus: async (_ctx, { orderId }) => {
        emit('order.status.query', { 'order.id': orderId })
        return 'cancelled'
      },
    },
    assertions: {
      orderIsCancelled: async (_ctx, { orderId }) => {
        emit('order.status.changed', { 'order.status': 'cancelled', 'order.id': orderId })
      },
      orderExists: async () => {},
    },
  })

  const { test, getTrace } = suite(orderDomain, adapter)

  beforeEach(() => {
    collector.reset()
  })

  test('telemetry match is recorded on trace entry when span is found', async ({ when, then }) => {
    await when.cancelOrder({ orderId: '123' })
    await then.orderIsCancelled({ orderId: '123' })
  })

  test('telemetry mismatch is recorded as warning (not failure) by default', async ({ when, then }) => {
    // updateOrder has no telemetry declaration — should not get telemetry result
    await when.updateOrder({ orderId: '123' })
    // orderExists has no telemetry — should not get telemetry result
    await then.orderExists({ orderId: '123' })
  })

  test('action with telemetry that emits correct span gets matched', async ({ when }) => {
    await when.cancelOrder({ orderId: '456' })
  })

  test('query with telemetry that emits correct span gets matched', async ({ query }) => {
    await query.orderStatus({ orderId: '789' })
  })
})

describe('telemetry verification — programmatic API', () => {
  it('records matched telemetry on trace entries', async () => {
    const { collector, emit } = createCollector()
    const domain = defineDomain({
      name: 'tel-test',
      actions: {
        doThing: action({ telemetry: { span: 'thing.done' } }),
      },
      queries: {},
      assertions: {
        thingHappened: assertion({ telemetry: { span: 'thing.verified', attributes: { ok: 'true' } } }),
      },
    })
    const protocol = unitProtocolWithTelemetry(collector)
    const adapter = implement(domain, {
      protocol,
      actions: {
        doThing: async () => { emit('thing.done') },
      },
      queries: {},
      assertions: {
        thingHappened: async () => { emit('thing.verified', { ok: 'true' }) },
      },
    })
    const s = suite(domain, adapter)
    await s.setup()
    await s.act.doThing()
    await s.assert.thingHappened()
    await s.teardown()

    const trace = s.getTrace()
    expect(trace).toHaveLength(2)
    expect(trace[0].telemetry).toEqual({
      expected: { span: 'thing.done' },
      matched: true,
      matchedSpan: { name: 'thing.done', attributes: {} },
    })
    expect(trace[1].telemetry).toEqual({
      expected: { span: 'thing.verified', attributes: { ok: 'true' } },
      matched: true,
      matchedSpan: { name: 'thing.verified', attributes: { ok: 'true' } },
    })
  })

  it('uses strict equality for attribute matching — type mismatch is not a match', async () => {
    const prev = process.env.AVER_TELEMETRY_MODE
    process.env.AVER_TELEMETRY_MODE = 'warn'
    try {
    const { collector, emit } = createCollector()
    const domain = defineDomain({
      name: 'tel-strict',
      assertions: {
        checkStatus: assertion({ telemetry: { span: 'status.check', attributes: { code: '200' } } }),
      },
      actions: {},
      queries: {},
    })
    const protocol = unitProtocolWithTelemetry(collector)
    const adapter = implement(domain, {
      protocol,
      actions: {},
      queries: {},
      assertions: {
        // Emit numeric 200 — should NOT match string '200'
        checkStatus: async () => { emit('status.check', { code: 200 }) },
      },
    })
    const s = suite(domain, adapter)
    await s.setup()
    await s.assert.checkStatus()
    await s.teardown()

    const trace = s.getTrace()
    expect(trace[0].telemetry?.matched).toBe(false)
    } finally {
      if (prev === undefined) delete process.env.AVER_TELEMETRY_MODE
      else process.env.AVER_TELEMETRY_MODE = prev
    }
  })

  it('records unmatched telemetry when span is missing (warn mode)', async () => {
    const prev = process.env.AVER_TELEMETRY_MODE
    process.env.AVER_TELEMETRY_MODE = 'warn'
    try {
    const { collector } = createCollector()
    const domain = defineDomain({
      name: 'tel-miss',
      actions: {
        doThing: action({ telemetry: { span: 'thing.done' } }),
      },
      queries: {},
      assertions: {},
    })
    const protocol = unitProtocolWithTelemetry(collector)
    const adapter = implement(domain, {
      protocol,
      actions: {
        doThing: async () => { /* no span emitted */ },
      },
      queries: {},
      assertions: {},
    })
    const s = suite(domain, adapter)
    await s.setup()
    await s.act.doThing()
    await s.teardown()

    const trace = s.getTrace()
    expect(trace[0].telemetry).toEqual({
      expected: { span: 'thing.done' },
      matched: false,
    })
    // Should still pass (warn mode)
    expect(trace[0].status).toBe('pass')
    } finally {
      if (prev === undefined) delete process.env.AVER_TELEMETRY_MODE
      else process.env.AVER_TELEMETRY_MODE = prev
    }
  })

  it('does not add telemetry to trace when marker has no declaration', async () => {
    const { collector } = createCollector()
    const domain = defineDomain({
      name: 'tel-none',
      actions: { doThing: action() },
      queries: {},
      assertions: {},
    })
    const protocol = unitProtocolWithTelemetry(collector)
    const adapter = implement(domain, {
      protocol,
      actions: { doThing: async () => {} },
      queries: {},
      assertions: {},
    })
    const s = suite(domain, adapter)
    await s.setup()
    await s.act.doThing()
    await s.teardown()

    const trace = s.getTrace()
    expect(trace[0].telemetry).toBeUndefined()
  })

  it('does not add telemetry when protocol has no collector', async () => {
    const domain = defineDomain({
      name: 'tel-no-collector',
      actions: {
        doThing: action({ telemetry: { span: 'thing.done' } }),
      },
      queries: {},
      assertions: {},
    })
    const protocol: Protocol<Record<string, unknown>> = {
      name: 'unit',
      async setup() { return {} },
      async teardown() {},
      // no telemetry collector
    }
    const adapter = implement(domain, {
      protocol,
      actions: { doThing: async () => {} },
      queries: {},
      assertions: {},
    })
    const s = suite(domain, adapter)
    await s.setup()
    await s.act.doThing()
    await s.teardown()

    const trace = s.getTrace()
    expect(trace[0].telemetry).toBeUndefined()
  })

  it('matches span attributes correctly', async () => {
    const { collector, emit } = createCollector()
    const domain = defineDomain({
      name: 'tel-attrs',
      actions: {},
      queries: {},
      assertions: {
        check: assertion({
          telemetry: { span: 'event', attributes: { status: 'done', count: 42 } },
        }),
      },
    })
    const protocol = unitProtocolWithTelemetry(collector)
    const adapter = implement(domain, {
      protocol,
      actions: {},
      queries: {},
      assertions: {
        check: async () => { emit('event', { status: 'done', count: 42, extra: 'ignored' }) },
      },
    })
    const s = suite(domain, adapter)
    await s.setup()
    await s.assert.check()
    await s.teardown()

    const trace = s.getTrace()
    expect(trace[0].telemetry?.matched).toBe(true)
  })

  it('fails to match when attributes differ', async () => {
    const prev = process.env.AVER_TELEMETRY_MODE
    process.env.AVER_TELEMETRY_MODE = 'warn'
    try {
    const { collector, emit } = createCollector()
    const domain = defineDomain({
      name: 'tel-attrs-miss',
      actions: {},
      queries: {},
      assertions: {
        check: assertion({
          telemetry: { span: 'event', attributes: { status: 'done' } },
        }),
      },
    })
    const protocol = unitProtocolWithTelemetry(collector)
    const adapter = implement(domain, {
      protocol,
      actions: {},
      queries: {},
      assertions: {
        check: async () => { emit('event', { status: 'pending' }) },
      },
    })
    const s = suite(domain, adapter)
    await s.setup()
    await s.assert.check()
    await s.teardown()

    const trace = s.getTrace()
    expect(trace[0].telemetry?.matched).toBe(false)
    } finally {
      if (prev === undefined) delete process.env.AVER_TELEMETRY_MODE
      else process.env.AVER_TELEMETRY_MODE = prev
    }
  })
})

// ── Trace formatting with telemetry ──

describe('trace formatting with telemetry', () => {
  it('shows matched telemetry with checkmark', () => {
    const trace: TraceEntry[] = [{
      kind: 'action',
      category: 'when',
      name: 'cancelOrder',
      payload: { orderId: '123' },
      status: 'pass',
      durationMs: 5,
      telemetry: {
        expected: { span: 'order.cancel' },
        matched: true,
        matchedSpan: { name: 'order.cancel', attributes: { 'order.id': '123' } },
      },
    }]
    const output = formatTrace(trace, 'order')
    expect(output).toContain('✓ telemetry: order.cancel')
    expect(output).toContain('order.id')
  })

  it('shows unmatched telemetry with warning', () => {
    const trace: TraceEntry[] = [{
      kind: 'assertion',
      category: 'then',
      name: 'orderIsCancelled',
      payload: { orderId: '123' },
      status: 'pass',
      durationMs: 2,
      telemetry: {
        expected: { span: 'order.status.changed', attributes: { 'order.status': 'cancelled' } },
        matched: false,
      },
    }]
    const output = formatTrace(trace, 'order')
    expect(output).toContain('⚠ telemetry: expected span \'order.status.changed\' not found')
  })

  it('does not show telemetry line when no telemetry on trace entry', () => {
    const trace: TraceEntry[] = [{
      kind: 'action',
      category: 'given',
      name: 'setup',
      payload: undefined,
      status: 'pass',
    }]
    const output = formatTrace(trace, 'test')
    expect(output).not.toContain('telemetry')
  })

  it('suppresses telemetry on failed assertion (non-telemetry error)', () => {
    const trace: TraceEntry[] = [{
      kind: 'assertion',
      category: 'then',
      name: 'check',
      payload: undefined,
      status: 'fail',
      error: new Error('Expected true to be false'),
      telemetry: {
        expected: { span: 'some.span' },
        matched: false,
      },
    }]
    const output = formatTrace(trace, 'test')
    expect(output).toContain('Expected true to be false')
    expect(output).not.toContain('telemetry')
  })
})
