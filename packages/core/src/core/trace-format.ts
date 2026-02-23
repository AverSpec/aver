import type { Domain } from './domain'
import type { TraceEntry } from './trace'

export function formatTrace(trace: TraceEntry[], domainName: string): string {
  return trace
    .map(e => {
      const icon = e.status === 'pass' ? '[PASS]' : '[FAIL]'
      let payloadStr = ''
      if (e.payload !== undefined) {
        try {
          const json = JSON.stringify(e.payload)
          payloadStr = json.length > 60 ? json.substring(0, 57) + '...' : json
        } catch {
          payloadStr = '[unserializable]'
        }
      }
      const errorStr = e.status === 'fail' && e.error
        ? ` — ${(e.error as Error).message ?? e.error}`
        : ''
      return `  ${icon} ${domainName}.${e.name}(${payloadStr})${errorStr}`
    })
    .join('\n')
}

export function enhanceWithTrace(error: unknown, trace: TraceEntry[], domain: Domain, protocolName?: string): Error {
  if (trace.length === 0) {
    return error instanceof Error ? error : new Error(String(error))
  }
  const traceStr = formatTrace(trace, domain.name)
  const header = protocolName ? `Action trace (${protocolName}):` : 'Action trace:'
  const enhanced = new Error(
    `${(error as Error).message}\n\n${header}\n${traceStr}`
  )
  enhanced.cause = error
  return enhanced
}
