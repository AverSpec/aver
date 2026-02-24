import { defineDomain, action, query, assertion } from '@aver/core'
import type { TelemetryEvent } from '../../../src/types'
import type { TelemetrySchema } from '../../../src/schema'

export const telemetry = defineDomain({
  name: 'Telemetry',
  actions: {
    instrumentDomain: action<{ domainName: string; sinkType: string; scrub?: string[] }>(),
    emitAction: action<{ operation: string; payload?: any }>(),
    emitQuery: action<{ operation: string; payload?: any; result?: any }>(),
  },
  queries: {
    emittedEvents: query<void, TelemetryEvent[]>(),
    eventCount: query<void, number>(),
    schema: query<{ domainName: string }, TelemetrySchema>(),
  },
  assertions: {
    eventEmitted: assertion<{ operation: string }>(),
    payloadScrubbed: assertion<{ field: string }>(),
    schemaMatchesDomain: assertion<{ domainName: string }>(),
  },
})
