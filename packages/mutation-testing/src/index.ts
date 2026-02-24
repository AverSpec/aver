// TODO: CLI integration — `aver mutate` subcommand. Requires core CLI
// subcommand registration. Deferred until CLI plugin architecture exists.

// Types
export type {
  MutantStatus,
  MutantResult,
  MutantLocation,
  MutationRunner,
  MutationRunnerOptions,
  AdapterOperator,
  AdapterMutant,
  SurvivedMutant,
  MutationScorecard,
  MutationReport,
} from './engine-types.js'

// Engine
export { runMutationEngine } from './engine.js'
export type { MutationEngineConfig, MutationEngineResult } from './engine.js'

// Adapter mutations
export { generateAdapterMutants, runMutant } from './adapter-mutator.js'

// Operators
export { removalOperator, returnValueOperator, throwErrorOperator, defaultOperators } from './operators/index.js'

// Runners
export { createStrykerRunner } from './runners/stryker.js'

// Report
export { formatReport } from './report.js'

// Candidates
export { generateCandidates } from './candidates.js'
export type { RefinementCandidate } from './candidates.js'
