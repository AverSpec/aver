import { defineDomain, action, query, assertion } from '@aver/core'

export const averWorkspace = defineDomain({
  name: 'AverWorkspace',
  actions: {
    captureScenario: action<{
      behavior: string
      context?: string
      story?: string
      mode?: 'observed' | 'intended'
    }>({
      telemetry: (p) => ({
        span: 'workspace.scenario.capture',
        attributes: { 'scenario.mode': p.mode ?? 'observed' },
      }),
    }),
    updateScenario: action<{
      id: string
      behavior?: string
      rules?: string[]
      context?: string
      story?: string
      examples?: { description: string; expectedOutcome: string; given?: string }[]
      constraints?: string[]
      seams?: { type: string; location: string; description: string }[]
    }>(),
    advanceScenario: action<{ id: string; rationale: string; promotedBy: string }>({
      telemetry: (p) => ({
        span: 'workspace.scenario.advance',
        attributes: { 'scenario.id': p.id, 'advance.promoted_by': p.promotedBy },
      }),
    }),
    revisitScenario: action<{ id: string; targetStage: string; rationale: string }>({
      telemetry: (p) => ({
        span: 'workspace.scenario.revisit',
        attributes: { 'scenario.id': p.id, 'revisit.target_stage': p.targetStage },
      }),
    }),
    confirmScenario: action<{ id: string; confirmer: string }>({
      telemetry: (p) => ({
        span: 'workspace.scenario.confirm',
        attributes: { 'scenario.id': p.id, 'scenario.confirmed_by': p.confirmer },
      }),
    }),
    deleteScenario: action<{ id: string }>({
      telemetry: (p) => ({
        span: 'workspace.scenario.delete',
        attributes: { 'scenario.id': p.id },
      }),
    }),
    addQuestion: action<{ scenarioId: string; text: string }>({
      telemetry: (p) => ({
        span: 'workspace.question.add',
        attributes: { 'scenario.id': p.scenarioId },
      }),
    }),
    resolveQuestion: action<{ scenarioId: string; questionId: string; answer: string }>({
      telemetry: (p) => ({
        span: 'workspace.question.resolve',
        attributes: { 'scenario.id': p.scenarioId, 'question.id': p.questionId },
      }),
    }),
    linkToDomain: action<{
      scenarioId: string
      domainOperation?: string
      testNames?: string[]
      approvalBaseline?: string
    }>({
      telemetry: (p) => ({
        span: 'workspace.scenario.link',
        attributes: { 'scenario.id': p.scenarioId },
      }),
    }),
    importScenarios: action<{ json: string }>(),
  },
  queries: {
    scenarioSummary: query<
      void,
      { captured: number; characterized: number; mapped: number; specified: number; implemented: number; total: number; openQuestions: number }
    >({ telemetry: { span: 'workspace.scenario.summary' } }),
    scenarios: query<
      {
        stage?: string
        story?: string
        keyword?: string
        mode?: 'observed' | 'intended'
        hasConfirmation?: boolean
        domainOperation?: string
        hasOpenQuestions?: boolean
        fields?: string[]
      } | void,
      Array<{ id: string; stage: string; behavior: string; domainOperation?: string }>
    >(),
    advanceCandidates: query<void, Array<{ id: string; stage: string }>>(),
    workflowPhase: query<void, { name: string; description: string; recommendedActions: string[] }>(),
    exportedScenarios: query<{ format: string }, string>(),
  },
  assertions: {
    scenarioIsAt: assertion<{ id: string; stage: string }>({
      telemetry: (p) => ({
        span: 'workspace.scenario.advance',
        attributes: { 'scenario.id': p.id, 'scenario.stage.to': p.stage },
      }),
    }),
    scenarioHasBehavior: assertion<{ id: string; behavior: string }>({
      telemetry: (p) => ({
        span: 'workspace.scenario.capture',
        attributes: { 'scenario.id': p.id },
      }),
    }),
    scenarioHasConfirmation: assertion<{ id: string; confirmer: string }>({
      telemetry: (p) => ({
        span: 'workspace.scenario.confirm',
        attributes: { 'scenario.id': p.id, 'scenario.confirmed_by': p.confirmer },
      }),
    }),
    confirmationCleared: assertion<{ id: string }>({
      telemetry: (p) => ({
        span: 'workspace.scenario.revisit',
        attributes: { 'scenario.id': p.id },
      }),
    }),
    advancementBlocked: assertion<{ id: string; reason: string }>({
      telemetry: (p) => ({
        span: 'workspace.scenario.advance',
        attributes: { 'scenario.id': p.id },
      }),
    }),
    advancementSucceeded: assertion<{ id: string; to: string }>({
      telemetry: (p) => ({
        span: 'workspace.scenario.advance',
        attributes: { 'scenario.stage.to': p.to },
      }),
    }),
    transitionRecorded: assertion<{ id: string; from: string; to: string; by: string }>({
      telemetry: (p) => ({
        span: 'workspace.scenario.advance',
        attributes: { 'scenario.stage.from': p.from, 'scenario.stage.to': p.to },
      }),
    }),
    questionExists: assertion<{ scenarioId: string; text: string }>({
      telemetry: (p) => ({
        span: 'workspace.question.add',
        attributes: { 'scenario.id': p.scenarioId },
      }),
    }),
    questionResolved: assertion<{ scenarioId: string; questionId: string; answer: string }>({
      telemetry: (p) => ({
        span: 'workspace.question.resolve',
        attributes: { 'scenario.id': p.scenarioId, 'question.id': p.questionId },
      }),
    }),
    domainLinksAre: assertion<{ id: string; domainOperation?: string; testNames?: string[] }>({
      telemetry: (p) => ({
        span: 'workspace.scenario.link',
        attributes: { 'scenario.id': p.id },
      }),
    }),
    scenarioCountIs: assertion<{ count: number }>({
      telemetry: (p) => ({
        span: 'workspace.scenario.summary',
        attributes: { 'scenario.total': p.count },
      }),
    }),
    stageCountIs: assertion<{ stage: string; count: number }>({
      telemetry: (p) => ({
        span: 'workspace.scenario.summary',
        attributes: { 'scenario.total': p.count },
      }),
    }),
    filterReturns: assertion<{ count: number }>(),
    importResultIs: assertion<{ added: number; skipped: number }>(),
    exportContains: assertion<{ format: string; text: string }>(),
    operationFailed: assertion<{ message: string }>(),
  },
})
