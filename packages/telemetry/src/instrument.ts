import { randomUUID } from 'node:crypto'
import type { Domain } from '@aver/core'
import type { InstrumentOptions, TelemetryEvent } from './types.js'
import { scrubPayload } from './scrub.js'

export interface DomainEmitter {
  action(operation: string, payload?: unknown, error?: unknown): Promise<void>
  query(operation: string, payload?: unknown, result?: unknown, durationMs?: number, error?: unknown): Promise<void>
  assertion(operation: string, payload?: unknown, error?: unknown): Promise<void>
  withCorrelation(correlationId: string): DomainEmitter
}

export function instrument(domain: Domain, options: InstrumentOptions): DomainEmitter {
  const { sink, scrub = [], environment = 'production' } = options
  const domainName = domain.name

  // Validate operations exist in domain
  const validActions = new Set(Object.keys(domain.vocabulary.actions))
  const validQueries = new Set(Object.keys(domain.vocabulary.queries))
  const validAssertions = new Set(Object.keys(domain.vocabulary.assertions))

  async function emit(
    kind: TelemetryEvent['kind'],
    operation: string,
    payload?: unknown,
    result?: unknown,
    durationMs?: number,
    correlationId?: string,
    error?: unknown,
  ): Promise<void> {
    const event: TelemetryEvent = {
      schemaVersion: '1.0.0',
      domain: domainName,
      operation,
      kind,
      payload: scrubPayload(payload, scrub),
      result: result !== undefined ? scrubPayload(result, scrub) : undefined,
      error: error instanceof Error ? error.message : error,
      durationMs,
      timestamp: new Date().toISOString(),
      correlationId: correlationId ?? randomUUID(),
      environment,
    }
    await sink.emit(event)
  }

  function createEmitter(correlationId?: string): DomainEmitter {
    return {
      async action(operation: string, payload?: unknown, error?: unknown): Promise<void> {
        if (!validActions.has(operation))
          throw new Error(`Unknown action: ${operation} in domain ${domainName}`)
        await emit('action', operation, payload, undefined, undefined, correlationId, error)
      },
      async query(operation: string, payload?: unknown, result?: unknown, durationMs?: number, error?: unknown): Promise<void> {
        if (!validQueries.has(operation))
          throw new Error(`Unknown query: ${operation} in domain ${domainName}`)
        await emit('query', operation, payload, result, durationMs, correlationId, error)
      },
      async assertion(operation: string, payload?: unknown, error?: unknown): Promise<void> {
        if (!validAssertions.has(operation))
          throw new Error(`Unknown assertion: ${operation} in domain ${domainName}`)
        await emit('assertion', operation, payload, undefined, undefined, correlationId, error)
      },
      withCorrelation(id: string): DomainEmitter {
        return createEmitter(id)
      },
    }
  }

  return createEmitter()
}
