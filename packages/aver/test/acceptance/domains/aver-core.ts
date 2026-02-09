import { defineDomain, action, query, assertion } from '../../../src/index'

export const averCore = defineDomain({
  name: 'AverCore',
  actions: {
    defineDomain: action<{
      name: string
      actions: string[]
      queries: Array<{ name: string; returnType: string }>
      assertions: string[]
    }>(),
    extendDomain: action<{
      actions?: string[]
      queries?: Array<{ name: string; returnType: string }>
      assertions?: string[]
    }>(),
    implementDomain: action(),
    registerAdapter: action(),
    createSuite: action(),
    executeAction: action<{ name: string; payload?: Record<string, unknown> }>(),
    executeQuery: action<{ name: string }>(),
    executeAssertion: action<{ name: string; payload?: Record<string, unknown> }>(),
    executeFailingAssertion: action<{ name: string; payload?: Record<string, unknown> }>(),
  },
  queries: {
    vocabularyKeys: query<{ actions: string[]; queries: string[]; assertions: string[] }>(),
    actionTrace: query<Array<{ kind: string; name: string; status: string }>>(),
    parentDomainName: query<string | undefined>(),
  },
  assertions: {
    hasVocabulary: assertion<{ actions: string[]; queries: string[]; assertions: string[] }>(),
    adapterResolved: assertion(),
    traceContains: assertion<{ kind: string; name: string; status: string }>(),
    traceHasLength: assertion<{ length: number }>(),
    hasParent: assertion<{ name: string }>(),
    queryReturned: assertion<{ name: string; value: unknown }>(),
  },
})
