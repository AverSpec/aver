import { defineDomain, action, query, assertion } from '../../../src/index'

export const averInit = defineDomain({
  name: 'AverInit',
  actions: {
    initProject: action<{ dir: string }>(),
    initDomain: action<{ dir: string; name: string; protocol: string }>(),
  },
  queries: {
    fileContents: query<{ path: string }, string>(),
    generatedFiles: query<{ dir: string }, string[]>(),
  },
  assertions: {
    fileExists: assertion<{ path: string }>(),
    fileContains: assertion<{ path: string; content: string }>(),
    configRegistersAdapter: assertion<{ dir: string; adapterImport: string }>(),
    throwsError: assertion<{ message: string }>(),
  },
})
