import { describe, expect } from 'vitest'
import { suite } from '@aver/core'
import { telemetry } from './domains/telemetry'
import { telemetryAdapter } from './adapters/telemetry.unit'

describe('Telemetry Acceptance', () => {
  const { test } = suite(telemetry, telemetryAdapter)

  test('instrument a domain and emit an action event', async ({ act, assert }) => {
    await act.instrumentDomain({ domainName: 'SampleDomain', sinkType: 'collecting' })
    await act.emitAction({ operation: 'createItem', payload: { name: 'Widget' } })
    await assert.eventEmitted({ operation: 'createItem' })
  })

  test('emitted events are queryable', async ({ act, query }) => {
    await act.instrumentDomain({ domainName: 'SampleDomain', sinkType: 'collecting' })
    await act.emitAction({ operation: 'createItem', payload: { name: 'Widget' } })
    await act.emitQuery({ operation: 'getItem', payload: { id: '1' }, result: 'Widget' })

    const count = await query.eventCount()
    expect(count).toBe(2)

    const events = await query.emittedEvents()
    expect(events[0].kind).toBe('action')
    expect(events[1].kind).toBe('query')
  })

  test('schema generation matches domain', async ({ act, query, assert }) => {
    await act.instrumentDomain({ domainName: 'SampleDomain', sinkType: 'collecting' })
    const schema = await query.schema({ domainName: 'SampleDomain' })

    expect(schema.domain).toBe('SampleDomain')
    expect(schema.operations.length).toBeGreaterThan(0)
    await assert.schemaMatchesDomain({ domainName: 'SampleDomain' })
  })

  test('PII scrubbing works', async ({ act, assert }) => {
    await act.instrumentDomain({
      domainName: 'SampleDomain',
      sinkType: 'collecting',
      scrub: ['email'],
    })
    await act.emitAction({
      operation: 'createItem',
      payload: { name: 'Widget', email: 'user@example.com' },
    })
    await assert.payloadScrubbed({ field: 'email' })
  })
})
