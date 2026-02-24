import type { Adapter, Domain } from '@aver/core'
import type { AdapterOperator, AdapterMutant, MutantStatus } from './engine-types.js'

interface MutatedAdapterEntry {
  mutantId: string
  operatorName: string
  handlerKind: 'action' | 'query' | 'assertion'
  handlerName: string
  adapter: Adapter
}

/**
 * Generate mutated adapters by applying operators to each handler.
 * Each mutant replaces exactly one handler with a mutated version.
 */
export function generateAdapterMutants<D extends Domain>(
  adapter: Adapter,
  domain: D,
  operators: AdapterOperator[],
): MutatedAdapterEntry[] {
  const mutants: MutatedAdapterEntry[] = []
  let seq = 0

  for (const operator of operators) {
    const kinds = resolveTargets(operator.targets)

    for (const kind of kinds) {
      const handlerMap = getHandlerMap(adapter, kind)
      for (const name of Object.keys(handlerMap)) {
        const original = handlerMap[name]
        const mutated = operator.mutate(name, original)
        if (!mutated) continue

        seq++
        const mutantId = `adapter-${seq}`
        const clonedAdapter = cloneAdapterWithMutation(adapter, domain, kind, name, mutated)
        mutants.push({
          mutantId,
          operatorName: operator.name,
          handlerKind: kind,
          handlerName: name,
          adapter: clonedAdapter,
        })
      }
    }
  }

  return mutants
}

function resolveTargets(targets: AdapterOperator['targets']): Array<'action' | 'query' | 'assertion'> {
  if (targets === 'all') return ['action', 'query', 'assertion']
  // Map plural form to singular
  const map: Record<string, 'action' | 'query' | 'assertion'> = {
    actions: 'action',
    queries: 'query',
    assertions: 'assertion',
  }
  return [map[targets]]
}

function getHandlerMap(adapter: Adapter, kind: 'action' | 'query' | 'assertion'): Record<string, Function> {
  const key = kind === 'action' ? 'actions' : kind === 'query' ? 'queries' : 'assertions'
  return adapter.handlers[key] as Record<string, Function>
}

function cloneAdapterWithMutation(
  adapter: Adapter,
  domain: Domain,
  kind: 'action' | 'query' | 'assertion',
  handlerName: string,
  mutatedHandler: Function,
): Adapter {
  const key = kind === 'action' ? 'actions' : kind === 'query' ? 'queries' : 'assertions'
  return {
    domain,
    protocol: adapter.protocol,
    handlers: {
      actions: key === 'actions' ? { ...adapter.handlers.actions, [handlerName]: mutatedHandler } : adapter.handlers.actions,
      queries: key === 'queries' ? { ...adapter.handlers.queries, [handlerName]: mutatedHandler } : adapter.handlers.queries,
      assertions: key === 'assertions' ? { ...adapter.handlers.assertions, [handlerName]: mutatedHandler } : adapter.handlers.assertions,
    },
  }
}

/**
 * Run the domain's test suite against a mutated adapter.
 * Returns the mutant status based on whether tests pass or fail.
 */
export async function runMutant(
  mutant: MutatedAdapterEntry,
  testRunner: (adapter: Adapter) => Promise<{ passed: boolean; failedTests: string[] }>,
): Promise<AdapterMutant> {
  let status: MutantStatus
  let killedBy: string[] | undefined

  try {
    const result = await testRunner(mutant.adapter)
    if (result.passed) {
      status = 'survived'
    } else {
      status = 'killed'
      killedBy = result.failedTests
    }
  } catch {
    // If test runner throws, the mutant caused a runtime error — consider it killed
    status = 'runtime-error'
  }

  return {
    id: mutant.mutantId,
    operatorName: mutant.operatorName,
    handlerKind: mutant.handlerKind,
    handlerName: mutant.handlerName,
    status,
    killedBy,
  }
}
