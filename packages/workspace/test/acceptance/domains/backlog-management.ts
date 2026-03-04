import { defineDomain, action, query, assertion } from '@aver/core'

export const backlogManagement = defineDomain({
  name: 'BacklogManagement',
  actions: {
    createItem: action<{ title: string; priority?: string; type?: string; tags?: string[] }>(),
    selectItem: action<{ title: string }>(),
    updateItem: action<{ title?: string; description?: string; status?: string; type?: string; tags?: string[]; externalUrl?: string }>(),
    deleteItem: action<void>(),
    moveItem: action<{ priority?: string; after?: string; before?: string }>(),
    addReference: action<{ label: string; path: string }>(),
    linkScenario: action<{ scenarioId: string }>(),
  },
  queries: {
    itemStatus: query<void, string>(),
    itemPriority: query<void, string>(),
    itemCount: query<{ status?: string; priority?: string; type?: string; tag?: string }, number>(),
    itemOrder: query<{ priority?: string }, string[]>(),
    summaryCount: query<{ status: string }, number>(),
    summaryTotal: query<void, number>(),
    summaryByPriority: query<{ priority: string }, number>(),
  },
  assertions: {
    itemExists: assertion<{ title: string }>(),
    itemIsAt: assertion<{ status: string }>(),
    itemHasPriority: assertion<{ priority: string }>(),
    itemHasReference: assertion<{ label: string; path: string }>(),
    itemRankedBefore: assertion<{ other: string }>(),
    itemHasScenarioLink: assertion<{ scenarioId: string }>(),
    itemNotFound: assertion<{ id: string }>(),
    itemHasType: assertion<{ type: string }>(),
    itemHasTags: assertion<{ tags: string[] }>(),
    itemHasExternalUrl: assertion<{ url: string }>(),
    itemDeleted: assertion<void>(),
    operationFailed: assertion<{ message: string }>(),
  },
})
