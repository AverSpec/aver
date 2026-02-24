/**
 * Language-agnostic mutation testing types.
 *
 * MutationRunner is the interface that bridges to any mutation tool
 * (Stryker for TS/JS, PIT for Java, mutmut for Python, etc.).
 */

// --- Mutant Results ---

export type MutantStatus = 'killed' | 'survived' | 'timeout' | 'compile-error' | 'runtime-error'

export interface MutantResult {
  id: string
  status: MutantStatus
  mutatorName: string
  replacement: string
  location: MutantLocation
  killedBy?: string[]
  description?: string
}

export interface MutantLocation {
  file: string
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

// --- Mutation Runner Interface ---

export interface MutationRunnerOptions {
  /** File globs to mutate */
  scope?: string[]
  /** Only mutate changed files (for incremental CI) */
  incremental?: boolean
  /** Working directory */
  cwd?: string
}

/**
 * A MutationRunner wraps an external mutation testing tool.
 * Implementations translate between the tool's native API and Aver's types.
 */
export interface MutationRunner {
  readonly name: string
  run(opts: MutationRunnerOptions): Promise<MutantResult[]>
}

// --- Adapter Mutation Types ---

export interface AdapterOperator {
  readonly name: string
  readonly targets: 'actions' | 'queries' | 'assertions' | 'all'
  /**
   * Generate a mutated version of a handler.
   * Return null if this operator doesn't apply to the handler.
   */
  mutate(handlerName: string, handler: Function): Function | null
}

export interface AdapterMutant {
  id: string
  operatorName: string
  handlerKind: 'action' | 'query' | 'assertion'
  handlerName: string
  status: MutantStatus
  killedBy?: string[]
}

// --- Survived Mutant ---

export interface SurvivedMutant {
  id: string
  source: 'implementation' | 'adapter'
  operatorName: string
  description: string
  location?: MutantLocation
  handlerKind?: 'action' | 'query' | 'assertion'
  handlerName?: string
}

// --- Mutation Report ---

export interface MutationScorecard {
  total: number
  killed: number
  survived: number
  score: number
  survivors: SurvivedMutant[]
}

export interface MutationReport {
  schemaVersion: string
  domain: string
  timestamp: string
  implementation?: MutationScorecard
  adapters: Record<string, MutationScorecard>
}
