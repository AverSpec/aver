import type { Domain } from './domain'
import type { TraceEntry } from './trace'

function categoryLabel(entry: TraceEntry): string {
  if (entry.category) return entry.category.toUpperCase().padEnd(6)
  // Fallback for entries without category (backward compat, 'test' kind)
  switch (entry.kind) {
    case 'action': return 'ACT   '
    case 'query': return 'QUERY '
    case 'assertion': return 'ASSERT'
    default: return entry.kind.toUpperCase().padEnd(6)
  }
}

export function formatTrace(trace: TraceEntry[], domainName: string): string {
  return trace
    .map(e => {
      const label = categoryLabel(e)
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
      const durationStr = e.durationMs !== undefined ? `  ${e.durationMs}ms` : ''
      const errorStr = e.status === 'fail' && e.error
        ? ` — ${(e.error as Error).message ?? e.error}`
        : ''
      const effectiveDomain = e.domainName ?? domainName
      return `  ${icon} ${label} ${effectiveDomain}.${e.name}(${payloadStr})${durationStr}${errorStr}`
    })
    .join('\n')
}

export function enhanceComposedWithTrace(
  error: unknown,
  trace: TraceEntry[],
  protocolNames: string[],
): Error {
  if (trace.length === 0) {
    return error instanceof Error ? error : new Error(String(error))
  }
  const traceStr = formatTrace(trace, 'unknown')
  const header = protocolNames.length > 0
    ? `Action trace (${protocolNames.join(', ')}):`
    : 'Action trace:'
  const msg = error instanceof Error ? error.message : String(error)
  const enhanced = new Error(
    `${msg}\n\n${header}\n${traceStr}`
  )
  enhanced.cause = error
  return enhanced
}

export function enhanceWithTrace(error: unknown, trace: TraceEntry[], domain: Domain, protocolName?: string): Error {
  if (trace.length === 0) {
    return error instanceof Error ? error : new Error(String(error))
  }
  const traceStr = formatTrace(trace, domain.name)
  const header = protocolName ? `Action trace (${protocolName}):` : 'Action trace:'
  const msg = error instanceof Error ? error.message : String(error)
  const enhanced = new Error(
    `${msg}\n\n${header}\n${traceStr}`
  )
  enhanced.cause = error
  return enhanced
}
