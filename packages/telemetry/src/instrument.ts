import { randomUUID } from 'node:crypto'
import type { Domain } from '@aver/core'
import type { InstrumentOptions, TelemetryEvent } from './types.js'
import { scrubPayload } from './scrub.js'

export interface DomainEmitter {
  action(operation: string, payload?: unknown): void
  query(operation: string, payload?: unknown, result?: unknown, durationMs?: number): void
  assertion(operation: string, payload?: unknown): void
  withCorrelation(correlationId: string): DomainEmitter
}

export function instrument(domain: Domain, options: InstrumentOptions): DomainEmitter {
  const { sink, scrub = [], environment = 'production' } = options
  const domainName = domain.name

  // Validate operations exist in domain
  const validActions = new Set(Object.keys(domain.vocabulary.actions))
  const validQueries = new Set(Object.keys(domain.vocabulary.queries))
  const validAssertions = new Set(Object.keys(domain.vocabulary.assertions))

  function emit(
    kind: TelemetryEvent['kind'],
    operation: string,
    payload?: unknown,
    result?: unknown,
    durationMs?: number,
    correlationId?: string,
  ): void {
    const event: TelemetryEvent = {
      schemaVersion: '1.0.0',
      domain: domainName,
      operation,
      kind,
      payload: scrubPayload(payload, scrub),
      result: result !== undefined ? scrubPayload(result, scrub) : undefined,
      durationMs,
      timestamp: new Date().toISOString(),
      correlationId: correlationId ?? randomUUID(),
      environment,
    }
    sink.emit(event)
  }

  function createEmitter(correlationId?: string): DomainEmitter {
    return {
      action(operation: string, payload?: unknown): void {
        if (!validActions.has(operation))
          throw new Error(`Unknown action: ${operation} in domain ${domainName}`)
        emit('action', operation, payload, undefined, undefined, correlationId)
      },
      query(operation: string, payload?: unknown, result?: unknown, durationMs?: number): void {
        if (!validQueries.has(operation))
          throw new Error(`Unknown query: ${operation} in domain ${domainName}`)
        emit('query', operation, payload, result, durationMs, correlationId)
      },
      assertion(operation: string, payload?: unknown): void {
        if (!validAssertions.has(operation))
          throw new Error(`Unknown assertion: ${operation} in domain ${domainName}`)
        emit('assertion', operation, payload, undefined, undefined, correlationId)
      },
      withCorrelation(id: string): DomainEmitter {
        return createEmitter(id)
      },
    }
  }

  return createEmitter()
}
