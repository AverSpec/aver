import { defineDomain, action, query, assertion } from '@aver/core'

export const scenarioExportImport = defineDomain({
  name: 'ScenarioExportImport',
  actions: {
    captureScenario: action<{ behavior: string; story?: string }>(),
    addQuestion: action<{ text: string }>(),
    importScenarios: action<{ json: string }>(),
  },
  queries: {
    exportedMarkdown: query<void, string>(),
    exportedJson: query<void, string>(),
  },
  assertions: {
    markdownContains: assertion<{ text: string }>(),
    importResultIs: assertion<{ added: number; skipped: number }>(),
    scenarioSurvivedRoundTrip: assertion<{ behavior: string }>(),
    stageCountIs: assertion<{ stage: string; count: number }>(),
  },
})
