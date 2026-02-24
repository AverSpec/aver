import { describe, it, expect, vi } from 'vitest'
import { consoleSink } from '../../src/sinks/console'
import { otelFormatSink } from '../../src/sinks/otel'
import type { TelemetryEvent } from '../../src/types'

function makeTelemetryEvent(overrides?: Partial<TelemetryEvent>): TelemetryEvent {
  return {
    schemaVersion: '1.0.0',
    domain: 'TestDomain',
    operation: 'doWork',
    kind: 'action',
    payload: { input: 'test' },
    timestamp: '2026-01-01T00:00:00.000Z',
    correlationId: 'test-correlation-id',
    environment: 'production',
    ...overrides,
  }
}

describe('consoleSink', () => {
  it('calls console.log with JSON', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const sink = consoleSink()
    const event = makeTelemetryEvent()

    sink.emit(event)

    expect(spy).toHaveBeenCalledOnce()
    expect(spy).toHaveBeenCalledWith(JSON.stringify(event))
    spy.mockRestore()
  })
})

describe('otelFormatSink', () => {
  it('adds service.name and otel.kind to output', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const sink = otelFormatSink({ serviceName: 'my-service' })
    const event = makeTelemetryEvent({ kind: 'query' })

    sink.emit(event)

    expect(spy).toHaveBeenCalledOnce()
    const output = JSON.parse(spy.mock.calls[0][0])
    expect(output['service.name']).toBe('my-service')
    expect(output['otel.kind']).toBe('CLIENT')
    spy.mockRestore()
  })

  it('uses INTERNAL kind for non-query events', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const sink = otelFormatSink({ serviceName: 'my-service' })
    const event = makeTelemetryEvent({ kind: 'action' })

    sink.emit(event)

    const output = JSON.parse(spy.mock.calls[0][0])
    expect(output['otel.kind']).toBe('INTERNAL')
    spy.mockRestore()
  })
})
