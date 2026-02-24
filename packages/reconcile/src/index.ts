// TODO: CLI integration — `aver reconcile` subcommand. Requires core CLI
// subcommand registration. Deferred until CLI plugin architecture exists.

export type {
  TelemetryEvent,
  UncoveredOperation,
  CandidateScenario,
  ReconciliationResult,
  EventSource,
  ScenarioRef,
} from './types.js'

export { reconcile } from './reconcile.js'
export type { ReconcileOptions } from './reconcile.js'

export { generateCandidates } from './candidates.js'
export { fingerprint, deduplicate } from './fingerprint.js'

export { fileSource } from './sources/file.js'
export { memorySource } from './sources/memory.js'
export { otelQuerySource } from './sources/otel-query.js'
export type { OTelQueryOptions } from './sources/otel-query.js'
