import { defineDomain, action, query, assertion } from '@aver/core'

export const workspacePersistence = defineDomain({
  name: 'WorkspacePersistence',
  actions: {
    captureScenario: action<{ behavior: string }>(),
    reloadFromDisk: action(),
  },
  queries: {
    scenarioCount: query<void, number>(),
  },
  assertions: {
    scenarioSurvivedReload: assertion<{ behavior: string }>(),
    scenarioCountIs: assertion<{ count: number }>(),
  },
})
