import { describe, it, expect } from 'vitest'
import { defineDomain, action, query, assertion } from '@aver/core'
import { instrument } from '../../src/instrument'
import type { TelemetryEvent, TelemetrySink } from '../../src/types'

const testDomain = defineDomain({
  name: 'TestDomain',
  actions: { doWork: action<{ input: string }>() },
  queries: { getResult: query<void, string>() },
  assertions: { isCorrect: assertion<void>() },
})

function collectingSink(): { collected: TelemetryEvent[]; sink: TelemetrySink } {
  const collected: TelemetryEvent[] = []
  const sink: TelemetrySink = { emit: (e) => { collected.push(e) } }
  return { collected, sink }
}

describe('instrument()', () => {
  it('emitting an action creates a valid TelemetryEvent', () => {
    const { collected, sink } = collectingSink()
    const emitter = instrument(testDomain, { sink })

    emitter.action('doWork', { input: 'hello' })

    expect(collected).toHaveLength(1)
    const event = collected[0]
    expect(event.domain).toBe('TestDomain')
    expect(event.operation).toBe('doWork')
    expect(event.kind).toBe('action')
    expect(event.payload).toEqual({ input: 'hello' })
    expect(event.schemaVersion).toBe('1.0.0')
    expect(event.timestamp).toBeDefined()
    expect(event.correlationId).toBeDefined()
  })

  it('emitting a query includes result and durationMs', () => {
    const { collected, sink } = collectingSink()
    const emitter = instrument(testDomain, { sink })

    emitter.query('getResult', undefined, 'the-result', 42)

    expect(collected).toHaveLength(1)
    const event = collected[0]
    expect(event.kind).toBe('query')
    expect(event.operation).toBe('getResult')
    expect(event.result).toBe('the-result')
    expect(event.durationMs).toBe(42)
  })

  it('unknown operation throws an error', () => {
    const { sink } = collectingSink()
    const emitter = instrument(testDomain, { sink })

    expect(() => emitter.action('nonExistent')).toThrow(
      'Unknown action: nonExistent in domain TestDomain',
    )
    expect(() => emitter.query('nonExistent')).toThrow(
      'Unknown query: nonExistent in domain TestDomain',
    )
    expect(() => emitter.assertion('nonExistent')).toThrow(
      'Unknown assertion: nonExistent in domain TestDomain',
    )
  })

  it('correlationId is generated per event by default', () => {
    const { collected, sink } = collectingSink()
    const emitter = instrument(testDomain, { sink })

    emitter.action('doWork', { input: 'a' })
    emitter.action('doWork', { input: 'b' })

    expect(collected[0].correlationId).toBeDefined()
    expect(collected[1].correlationId).toBeDefined()
    expect(collected[0].correlationId).not.toBe(collected[1].correlationId)
  })

  it('withCorrelation() uses the specified correlationId for all events', () => {
    const { collected, sink } = collectingSink()
    const emitter = instrument(testDomain, { sink })
    const correlated = emitter.withCorrelation('my-correlation-id')

    correlated.action('doWork', { input: 'a' })
    correlated.action('doWork', { input: 'b' })

    expect(collected[0].correlationId).toBe('my-correlation-id')
    expect(collected[1].correlationId).toBe('my-correlation-id')
  })

  it('environment defaults to production', () => {
    const { collected, sink } = collectingSink()
    const emitter = instrument(testDomain, { sink })

    emitter.action('doWork', { input: 'test' })

    expect(collected[0].environment).toBe('production')
  })

  it('custom environment is used', () => {
    const { collected, sink } = collectingSink()
    const emitter = instrument(testDomain, { sink, environment: 'staging' })

    emitter.action('doWork', { input: 'test' })

    expect(collected[0].environment).toBe('staging')
  })
})
