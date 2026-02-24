import type { MutationReport, MutationScorecard, SurvivedMutant } from './engine-types.js'

export function formatReport(report: MutationReport): string {
  const lines: string[] = []

  lines.push(`Mutation Testing Report: ${report.domain}`)
  lines.push(`Timestamp: ${report.timestamp}`)
  lines.push('')

  if (report.implementation) {
    lines.push('## Implementation Mutations')
    lines.push(formatScorecard(report.implementation))
    lines.push('')
  }

  for (const [name, scorecard] of Object.entries(report.adapters)) {
    lines.push(`## Adapter: ${name}`)
    lines.push(formatScorecard(scorecard))
    lines.push('')
  }

  return lines.join('\n')
}

function formatScorecard(sc: MutationScorecard): string {
  const lines: string[] = []
  const pct = (sc.score * 100).toFixed(1)
  lines.push(`  Score: ${pct}% (${sc.killed}/${sc.total} killed, ${sc.survived} survived)`)

  if (sc.survivors.length > 0) {
    lines.push('  Survivors:')
    for (const s of sc.survivors) {
      lines.push(formatSurvivor(s))
    }
  }

  return lines.join('\n')
}

function formatSurvivor(s: SurvivedMutant): string {
  const parts = [`    - [${s.operatorName}] ${s.description}`]
  if (s.location) {
    parts.push(`at ${s.location.file}:${s.location.startLine}`)
  }
  if (s.handlerKind && s.handlerName) {
    parts.push(`(${s.handlerKind}.${s.handlerName})`)
  }
  return parts.join(' ')
}
