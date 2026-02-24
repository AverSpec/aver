import type { Domain, Adapter } from '@aver/core'
import type {
  MutationRunner,
  MutationRunnerOptions,
  AdapterOperator,
  MutantResult,
  AdapterMutant,
  MutationReport,
  MutationScorecard,
  SurvivedMutant,
} from './engine-types.js'
import { generateAdapterMutants, runMutant } from './adapter-mutator.js'

export interface MutationEngineConfig {
  domain: Domain
  /** Runner for implementation mutations (e.g., Stryker). Optional. */
  runner?: MutationRunner
  /** Adapter mutation operators. */
  operators?: AdapterOperator[]
  /** Adapters to test for adapter mutations. */
  adapters?: Array<{ name: string; adapter: Adapter }>
  /** Function that runs the domain's test suite against a given adapter. */
  testRunner?: (adapter: Adapter) => Promise<{ passed: boolean; failedTests: string[] }>
}

export interface MutationEngineResult {
  implementation?: MutantResult[]
  adapters: Record<string, AdapterMutant[]>
  report: MutationReport
}

/**
 * Orchestrate mutation testing across both targets.
 */
export async function runMutationEngine(
  config: MutationEngineConfig,
  runnerOpts?: MutationRunnerOptions,
): Promise<MutationEngineResult> {
  const implementationResults = config.runner
    ? await config.runner.run(runnerOpts ?? {})
    : undefined

  const adapterResults: Record<string, AdapterMutant[]> = {}

  if (config.operators && config.testRunner && config.adapters) {
    for (const { name, adapter } of config.adapters) {
      const mutants = generateAdapterMutants(adapter, config.domain, config.operators)
      const results: AdapterMutant[] = []
      for (const mutant of mutants) {
        const result = await runMutant(mutant, config.testRunner)
        results.push(result)
      }
      adapterResults[name] = results
    }
  }

  const report = buildReport(config.domain.name, implementationResults, adapterResults)

  return {
    implementation: implementationResults,
    adapters: adapterResults,
    report,
  }
}

function buildReport(
  domainName: string,
  implementation: MutantResult[] | undefined,
  adapters: Record<string, AdapterMutant[]>,
): MutationReport {
  const report: MutationReport = {
    schemaVersion: '1.0.0',
    domain: domainName,
    timestamp: new Date().toISOString(),
    adapters: {},
  }

  if (implementation) {
    report.implementation = buildScorecard(
      implementation.map(r => ({
        id: r.id,
        status: r.status,
        source: 'implementation' as const,
        operatorName: r.mutatorName,
        description: r.replacement,
        location: r.location,
        killedBy: r.killedBy,
      }))
    )
  }

  for (const [name, results] of Object.entries(adapters)) {
    report.adapters[name] = buildScorecard(
      results.map(r => ({
        id: r.id,
        status: r.status,
        source: 'adapter' as const,
        operatorName: r.operatorName,
        description: `${r.handlerKind}.${r.handlerName}`,
        handlerKind: r.handlerKind,
        handlerName: r.handlerName,
        killedBy: r.killedBy,
      }))
    )
  }

  return report
}

interface ScorecardInput {
  id: string
  status: string
  source: 'implementation' | 'adapter'
  operatorName: string
  description: string
  location?: { file: string; startLine: number; startColumn: number; endLine: number; endColumn: number }
  handlerKind?: 'action' | 'query' | 'assertion'
  handlerName?: string
  killedBy?: string[]
}

function buildScorecard(results: ScorecardInput[]): MutationScorecard {
  const total = results.length
  const killed = results.filter(r => r.status === 'killed' || r.status === 'timeout' || r.status === 'runtime-error' || r.status === 'compile-error').length
  const survived = total - killed
  const score = total === 0 ? 1 : killed / total

  const survivors: SurvivedMutant[] = results
    .filter(r => r.status === 'survived')
    .map(r => ({
      id: r.id,
      source: r.source,
      operatorName: r.operatorName,
      description: r.description,
      location: r.location,
      handlerKind: r.handlerKind,
      handlerName: r.handlerName,
    }))

  return { total, killed, survived, score, survivors }
}
