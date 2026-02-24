import type { Domain } from '@aver/core'

export interface TelemetrySchema {
  domain: string
  operations: Array<{
    name: string
    kind: 'action' | 'query' | 'assertion'
  }>
}

export function generateSchema(domain: Domain): TelemetrySchema {
  const operations: TelemetrySchema['operations'] = []
  for (const name of Object.keys(domain.vocabulary.actions)) {
    operations.push({ name, kind: 'action' })
  }
  for (const name of Object.keys(domain.vocabulary.queries)) {
    operations.push({ name, kind: 'query' })
  }
  for (const name of Object.keys(domain.vocabulary.assertions)) {
    operations.push({ name, kind: 'assertion' })
  }
  return { domain: domain.name, operations }
}
