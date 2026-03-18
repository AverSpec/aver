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
      let line = `  ${icon} ${label} ${effectiveDomain}.${e.name}(${payloadStr})${durationStr}${errorStr}`

      // Telemetry verification result — only show when telemetry was checked and step didn't fail from assertion
      if (e.telemetry && !(e.status === 'fail' && e.error && !(e.error instanceof Error && e.error.message.startsWith('Telemetry mismatch')))) {
        if (e.telemetry.matched) {
          const attrs = e.telemetry.matchedSpan?.attributes
          const attrStr = attrs && Object.keys(attrs).length > 0
            ? ` ${JSON.stringify(attrs)}` : ''
          line += `\n           ✓ telemetry: ${e.telemetry.expected.span}${attrStr}`
        } else {
          line += `\n           ⚠ telemetry: expected span '${e.telemetry.expected.span}' not found`
        }
      }

      return line
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
    ? `Test steps (${protocolNames.join(', ')}):`
    : 'Test steps:'
  const msg = error instanceof Error ? error.message : String(error)
  const enhanced = new Error(
    `${msg}\n\n${header}\n${traceStr}`
  )
  enhanced.cause = error
  return enhanced
}

