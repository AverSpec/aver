import { defineDomain, action, query, assertion } from '@aver/core'

export const averMcp = defineDomain({
  name: 'AverMcp',
  actions: {
    // --- Fixtures (test setup) ---
    registerTestDomain: action<{
      name: string
      actions: string[]
      queries: string[]
      assertions: string[]
    }>(),
    saveTestRun: action<{
      results: Array<{
        testName: string
        domain: string
        status: 'pass' | 'fail' | 'skip'
        trace: Array<{ kind: string; name: string; status: string; error?: string }>
      }>
    }>(),
    saveMultipleRuns: action<{ count: number }>(),
    resetState: action(),
    reloadConfig: action<{ domainNames: string[] }>(),
    discoverDomains: action<{ domainNames: string[] }>(),

    // --- System actions (MCP tools that mutate) ---
    captureScenario: action<{
      behavior: string
      context?: string
      story?: string
      mode?: 'observed' | 'intended'
    }>(),
    advanceScenario: action<{ id: string; rationale: string; promotedBy: string }>(),
    revisitScenario: action<{ id: string; targetStage: string; rationale: string }>(),
    deleteScenario: action<{ id: string }>(),
    addQuestion: action<{ scenarioId: string; text: string }>(),
    resolveQuestion: action<{ scenarioId: string; questionId: string; answer: string }>(),
    linkToDomain: action<{
      scenarioId: string
      domainOperation?: string
      testNames?: string[]
      approvalBaseline?: string
    }>(),
    importScenarios: action<{ json: string }>(),
  },
  queries: {
    // --- System queries (MCP tools that read) ---
    domainList: query<void, Array<{ name: string; actionCount: number; queryCount: number; assertionCount: number }>>(),
    domainVocabulary: query<
      { name: string },
      { name: string; actions: string[]; queries: string[]; assertions: string[] } | null
    >(),
    adapterList: query<void, Array<{ domainName: string; protocolName: string }>>(),
    failureDetails: query<
      { domain?: string; testName?: string } | void,
      { failures: Array<{ testName: string; domain: string; error?: string; trace: unknown[] }> }
    >(),
    testTrace: query<
      { testName: string },
      { testName: string; status: string; trace: unknown[] } | null
    >(),
    runDiff: query<
      void,
      { newlyPassing: string[]; newlyFailing: string[]; stillFailing: string[] } | null
    >(),
    domainStructure: query<
      { description: string },
      { suggestedName: string; actions: unknown[]; queries: unknown[]; assertions: unknown[] }
    >(),
    adapterStructure: query<
      { domain: string; protocol: string },
      { domain: string; handlers: { actions: string[]; queries: string[]; assertions: string[] } } | null
    >(),
    projectContext: query<void, object | null>(),
    scenarioSummary: query<
      void,
      { captured: number; characterized: number; mapped: number; specified: number; implemented: number; total: number; openQuestions: number }
    >(),
    scenarios: query<
      { stage?: string; story?: string; keyword?: string } | void,
      Array<{ id: string; stage: string; behavior: string; domainOperation?: string }>
    >(),
    advanceCandidates: query<void, Array<{ id: string; stage: string }>>(),
    workflowPhase: query<void, { name: string; description: string; recommendedActions: string[] }>(),
    exportedScenarios: query<{ format: string }, string>(),

    // --- Test-support queries ---
    runCount: query<void, number>(),
    registeredDomainCount: query<void, number>(),
    lastCapturedScenario: query<void, { id: string; stage: string; behavior: string }>(),
    lastAddedQuestion: query<void, { id: string; text: string }>(),
    importResult: query<void, { added: number; skipped: number }>(),
  },
  assertions: {
    domainIsRegistered: assertion<{ name: string }>(),
    runCountIs: assertion<{ count: number }>(),
    scenarioHasStage: assertion<{ id: string; stage: string }>(),
    scenarioHasRevisitRationale: assertion<{ id: string; rationale: string }>(),
    questionIsResolved: assertion<{ scenarioId: string; questionId: string }>(),
    scenarioHasDomainOperation: assertion<{ id: string; operation: string }>(),
    importResultIs: assertion<{ added: number; skipped: number }>(),
    workflowPhaseIs: assertion<{ phase: string }>(),
    scenarioCountIs: assertion<{ count: number }>(),
    lastCapturedScenarioIs: assertion<{ stage: string; behavior: string }>(),
    summaryFieldIs: assertion<{ field: string; value: number }>(),
    lastQuestionTextIs: assertion<{ text: string }>(),
    filteredScenariosLengthIs: assertion<{ stage: string; count: number }>(),
    advanceCandidatesLengthIs: assertion<{ count: number }>(),
    exportContains: assertion<{ format: string; text: string }>(),
    runDiffHasNewlyFailing: assertion<{ testName: string }>(),
    runDiffHasNewlyPassing: assertion<{ testName: string }>(),
    runDiffIsNull: assertion(),
    domainVocabularyIsNull: assertion<{ name: string }>(),
    adapterExistsForDomain: assertion<{ domain: string }>(),
    projectContextIsNull: assertion(),
    domainStructureSuggestedNameIs: assertion<{ description: string; name: string }>(),
    adapterStructureDomainIs: assertion<{ domain: string; protocol: string; expectedDomain: string }>(),
    adapterStructureFirstActionIs: assertion<{ domain: string; protocol: string; action: string }>(),
    adapterStructureIsNull: assertion<{ domain: string; protocol: string }>(),
    firstFailureIs: assertion<{ testName: string; domain: string }>(),
    testTraceIs: assertion<{ testName: string; status: string }>(),
    testTraceIsNull: assertion<{ testName: string }>(),
  },
})
