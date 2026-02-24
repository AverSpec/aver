import type { Domain } from '@aver/core'
import type { TelemetryEvent, UncoveredOperation, ScenarioRef, ReconciliationResult } from './types.js'
import { generateCandidates } from './candidates.js'

export interface ReconcileOptions {
  domain: Domain
  scenarios: ScenarioRef[]
  events: TelemetryEvent[]
}

export function reconcile(opts: ReconcileOptions): ReconciliationResult {
  const { domain, scenarios, events } = opts

  // Build set of covered operations from scenarios
  const coveredOps = new Set(
    scenarios
      .filter(s => s.domainOperation)
      .map(s => s.domainOperation!),
  )

  // Build all known operations from domain vocabulary
  const allOps = new Map<string, 'action' | 'query' | 'assertion'>()
  for (const name of Object.keys(domain.vocabulary.actions)) allOps.set(name, 'action')
  for (const name of Object.keys(domain.vocabulary.queries)) allOps.set(name, 'query')
  for (const name of Object.keys(domain.vocabulary.assertions)) allOps.set(name, 'assertion')

  // Find operations that appear in production events but have no scenario coverage
  const eventsByOp = new Map<string, TelemetryEvent[]>()
  for (const event of events) {
    if (event.domain !== domain.name) continue
    const existing = eventsByOp.get(event.operation) ?? []
    existing.push(event)
    eventsByOp.set(event.operation, existing)
  }

  const uncoveredOperations: UncoveredOperation[] = []
  for (const [operation, opEvents] of eventsByOp) {
    if (coveredOps.has(operation)) continue
    const kind = allOps.get(operation) ?? opEvents[0]?.kind ?? 'action'
    const timestamps = opEvents.map(e => e.timestamp).sort()
    uncoveredOperations.push({
      domain: domain.name,
      operation,
      kind,
      eventCount: opEvents.length,
      firstSeen: timestamps[0],
      lastSeen: timestamps[timestamps.length - 1],
    })
  }

  const candidates = generateCandidates(uncoveredOperations, events)

  const totalOpsInEvents = eventsByOp.size
  const coveredInEvents = [...eventsByOp.keys()].filter(op => coveredOps.has(op)).length
  const uncoveredCount = totalOpsInEvents - coveredInEvents
  const percentage = totalOpsInEvents === 0 ? 100 : (coveredInEvents / totalOpsInEvents) * 100

  return {
    schemaVersion: '1.0.0',
    domain: domain.name,
    timestamp: new Date().toISOString(),
    uncoveredOperations,
    candidates,
    coverage: {
      covered: coveredInEvents,
      uncovered: uncoveredCount,
      percentage: Math.round(percentage * 10) / 10,
    },
  }
}
