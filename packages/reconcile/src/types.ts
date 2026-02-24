/**
 * TelemetryEvent shape — matches @aver/telemetry's TelemetryEvent.
 * Defined locally to avoid a hard dependency on @aver/telemetry.
 */
export interface TelemetryEvent {
  schemaVersion: string
  domain: string
  operation: string
  kind: 'action' | 'query' | 'assertion'
  payload: unknown
  result?: unknown
  error?: unknown
  durationMs?: number
  timestamp: string
  correlationId: string
  environment: string
}

export interface UncoveredOperation {
  domain: string
  operation: string
  kind: 'action' | 'query' | 'assertion'
  eventCount: number
  firstSeen: string
  lastSeen: string
}

export interface CandidateScenario {
  source: 'production-reconciliation'
  deviation: 'uncovered-operation'
  behavior: string
  evidence: {
    operations: TelemetryEvent[]
    eventCount: number
  }
  suggestedStage: 'captured'
  confidence: 'high' | 'medium' | 'low'
}

export interface ReconciliationResult {
  schemaVersion: string
  domain: string
  timestamp: string
  uncoveredOperations: UncoveredOperation[]
  candidates: CandidateScenario[]
  coverage: {
    covered: number
    uncovered: number
    percentage: number
  }
}

export interface EventSource {
  load(): Promise<TelemetryEvent[]>
}

export interface ScenarioRef {
  id: string
  behavior: string
  domainOperation?: string
}
