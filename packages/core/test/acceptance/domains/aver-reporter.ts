import { defineDomain, action, query, assertion } from '../../../src/index'

export const averReporter = defineDomain({
  name: 'AverReporter',
  actions: {
    generateReport: action<{
      name: string
      suites: Array<{
        name: string
        tests: number
        failures: number
        time: number
        testCases: Array<{
          name: string
          classname: string
          time: number
          failure?: { message: string; body: string }
        }>
      }>
    }>(),
  },
  queries: {
    lastXml: query<string>(),
  },
  assertions: {
    xmlContains: assertion<{ text: string }>(),
    xmlDoesNotContain: assertion<{ text: string }>(),
    hasTestCount: assertion<{ count: number }>(),
    hasFailureCount: assertion<{ count: number }>(),
  },
})
