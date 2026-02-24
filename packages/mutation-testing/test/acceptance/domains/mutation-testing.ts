import { defineDomain, action, query, assertion } from '@aver/core'
import type { SurvivedMutant, MutationReport } from '../../../src/engine-types'

export const mutationTesting = defineDomain({
  name: 'MutationTesting',
  actions: {
    runAdapterMutations: action<{ adapterName?: string }>(),
    registerOperator: action<{ name: string; targets: string }>(),
  },
  queries: {
    mutationScore: query<void, number>(),
    survivorCount: query<void, number>(),
    survivors: query<void, SurvivedMutant[]>(),
    report: query<void, MutationReport>(),
  },
  assertions: {
    allMutantsKilled: assertion<void>(),
    scoreAbove: assertion<{ threshold: number }>(),
    noSurvivorsIn: assertion<{ handlerName: string }>(),
  },
})
