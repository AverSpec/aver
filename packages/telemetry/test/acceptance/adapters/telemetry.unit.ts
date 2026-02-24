import { implement, unit, defineDomain, action, query, assertion } from '@aver/core'
import { telemetry } from '../domains/telemetry'
import { instrument } from '../../../src/instrument'
import { generateSchema } from '../../../src/schema'
import type { TelemetryEvent, TelemetrySink } from '../../../src/types'
import type { DomainEmitter } from '../../../src/instrument'
import type { Domain } from '@aver/core'

// A reusable test domain for instrumentation
const sampleDomain = defineDomain({
  name: 'SampleDomain',
  actions: { createItem: action<{ name: string; email?: string }>() },
  queries: { getItem: query<{ id: string }, string>() },
  assertions: { itemExists: assertion<{ id: string }>() },
})

interface TelemetryTestSession {
  collected: TelemetryEvent[]
  sink: TelemetrySink
  emitter?: DomainEmitter
  testDomain?: Domain
  scrubFields: string[]
}

export const telemetryAdapter = implement(telemetry, {
  protocol: unit<TelemetryTestSession>(() => {
    const collected: TelemetryEvent[] = []
    const sink: TelemetrySink = { emit: (e) => { collected.push(e) } }
    return { collected, sink, scrubFields: [] }
  }),

  actions: {
    instrumentDomain: async (session, { domainName: _domainName, sinkType: _sinkType, scrub }) => {
      session.scrubFields = scrub ?? []
      session.testDomain = sampleDomain
      session.emitter = instrument(sampleDomain, {
        sink: session.sink,
        scrub: session.scrubFields,
      })
    },

    emitAction: async (session, { operation, payload }) => {
      if (!session.emitter) throw new Error('Domain not instrumented')
      await session.emitter.action(operation, payload)
    },

    emitQuery: async (session, { operation, payload, result }) => {
      if (!session.emitter) throw new Error('Domain not instrumented')
      await session.emitter.query(operation, payload, result, 10)
    },
  },

  queries: {
    emittedEvents: async (session) => {
      return session.collected
    },

    eventCount: async (session) => {
      return session.collected.length
    },

    schema: async (session, { domainName: _domainName }) => {
      const domain = session.testDomain ?? sampleDomain
      return generateSchema(domain)
    },
  },

  assertions: {
    eventEmitted: async (session, { operation }) => {
      const found = session.collected.some((e) => e.operation === operation)
      if (!found) throw new Error(`Expected event with operation "${operation}" but none found`)
    },

    payloadScrubbed: async (session, { field }) => {
      const found = session.collected.some((e) => {
        if (!e.payload || typeof e.payload !== 'object') return false
        return (e.payload as Record<string, unknown>)[field] === '[REDACTED]'
      })
      if (!found)
        throw new Error(`Expected field "${field}" to be scrubbed in at least one event`)
    },

    schemaMatchesDomain: async (session, { domainName }) => {
      const domain = session.testDomain ?? sampleDomain
      const schema = generateSchema(domain)
      if (schema.domain !== domainName)
        throw new Error(`Expected schema domain "${domainName}" but got "${schema.domain}"`)
    },
  },
})
