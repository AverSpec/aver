import { describe, expect } from 'vitest'
import { suite } from '@aver/core'
import { telemetry } from './domains/telemetry'
import { telemetryAdapter } from './adapters/telemetry.unit'

describe('Telemetry Acceptance', () => {
  const { test } = suite(telemetry, telemetryAdapter)

  test('instrument a domain and emit an action event', async ({ given, when, then }) => {
    await given.instrumentDomain({ domainName: 'SampleDomain', sinkType: 'collecting' })
    await when.emitAction({ operation: 'createItem', payload: { name: 'Widget' } })
    await then.eventEmitted({ operation: 'createItem' })
  })

  test('emitted events are queryable', async ({ given, when, query }) => {
    await given.instrumentDomain({ domainName: 'SampleDomain', sinkType: 'collecting' })
    await when.emitAction({ operation: 'createItem', payload: { name: 'Widget' } })
    await when.emitQuery({ operation: 'getItem', payload: { id: '1' }, result: 'Widget' })

    const count = await query.eventCount()
    expect(count).toBe(2)
    // TODO: consider adding domain assertion

    const events = await query.emittedEvents()
    expect(events[0].kind).toBe('action')
    expect(events[1].kind).toBe('query')
    // TODO: consider adding domain assertion
  })

  test('schema generation matches domain', async ({ given, query, then }) => {
    await given.instrumentDomain({ domainName: 'SampleDomain', sinkType: 'collecting' })
    const schema = await query.schema({ domainName: 'SampleDomain' })

    expect(schema.domain).toBe('SampleDomain')
    expect(schema.operations.length).toBeGreaterThan(0)
    // TODO: consider adding domain assertion
    await then.schemaMatchesDomain({ domainName: 'SampleDomain' })
  })

  test('PII scrubbing works', async ({ given, when, then }) => {
    await given.instrumentDomain({
      domainName: 'SampleDomain',
      sinkType: 'collecting',
      scrub: ['email'],
    })
    await when.emitAction({
      operation: 'createItem',
      payload: { name: 'Widget', email: 'user@example.com' },
    })
    await then.payloadScrubbed({ field: 'email' })
  })
})
