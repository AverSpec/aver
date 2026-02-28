import { defineDomain, action, query, assertion } from '@aver/core'

export const backlogManagement = defineDomain({
  name: 'BacklogManagement',
  actions: {
    createItem: action<{ title: string; priority?: string; type?: string }>(),
    selectItem: action<{ title: string }>(),
    updateItem: action<{ title?: string; description?: string; status?: string }>(),
    deleteItem: action<void>(),
    moveItem: action<{ priority?: string; after?: string; before?: string }>(),
    addReference: action<{ label: string; path: string }>(),
    linkScenario: action<{ scenarioId: string }>(),
  },
  queries: {
    itemStatus: query<void, string>(),
    itemPriority: query<void, string>(),
    itemCount: query<{ status?: string; priority?: string }, number>(),
    itemOrder: query<{ priority?: string }, string[]>(),
  },
  assertions: {
    itemExists: assertion<{ title: string }>(),
    itemIsAt: assertion<{ status: string }>(),
    itemHasPriority: assertion<{ priority: string }>(),
    itemHasReference: assertion<{ label: string; path: string }>(),
    itemRankedBefore: assertion<{ other: string }>(),
    itemHasScenarioLink: assertion<{ scenarioId: string }>(),
    itemDeleted: assertion<void>(),
    operationFailed: assertion<{ message: string }>(),
  },
})
