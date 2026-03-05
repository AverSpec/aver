import { defineDomain, action, query, assertion } from '@aver/core'
import { expect } from 'vitest'

export const averWorkspace = defineDomain({
  name: 'AverWorkspace',
  actions: {
    captureScenario: action<{
      behavior: string
      context?: string
      story?: string
      mode?: 'observed' | 'intended'
    }>({ telemetry: { span: 'workspace.scenario.capture' } }),
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
    advanceScenario: action<{ id: string; rationale: string; promotedBy: string }>(
      { telemetry: { span: 'workspace.scenario.advance' } },
    ),
    revisitScenario: action<{ id: string; targetStage: string; rationale: string }>(
      { telemetry: { span: 'workspace.scenario.revisit' } },
    ),
    confirmScenario: action<{ id: string; confirmer: string }>(
      { telemetry: { span: 'workspace.scenario.confirm' } },
    ),
    deleteScenario: action<{ id: string }>(
      { telemetry: { span: 'workspace.scenario.delete' } },
    ),
    addQuestion: action<{ scenarioId: string; text: string }>(
      { telemetry: { span: 'workspace.question.add' } },
    ),
    resolveQuestion: action<{ scenarioId: string; questionId: string; answer: string }>(
      { telemetry: { span: 'workspace.question.resolve' } },
    ),
    linkToDomain: action<{
      scenarioId: string
      domainOperation?: string
      testNames?: string[]
      approvalBaseline?: string
    }>({ telemetry: { span: 'workspace.scenario.link' } }),
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
    scenarioIsAt: assertion<{ id: string; stage: string }>(
      { telemetry: { span: 'workspace.scenario.advance', attributes: { 'scenario.stage.to': expect.any(String) } } },
    ),
    scenarioHasBehavior: assertion<{ id: string; behavior: string }>(
      { telemetry: { span: 'workspace.scenario.capture', attributes: { 'scenario.id': expect.any(String) } } },
    ),
    scenarioHasConfirmation: assertion<{ id: string; confirmer: string }>(
      { telemetry: { span: 'workspace.scenario.confirm', attributes: { 'scenario.confirmed_by': expect.any(String) } } },
    ),
    confirmationCleared: assertion<{ id: string }>(
      { telemetry: { span: 'workspace.scenario.revisit', attributes: { 'scenario.stage.to': expect.any(String) } } },
    ),
    advancementBlocked: assertion<{ id: string; reason: string }>(
      { telemetry: { span: 'workspace.scenario.advance', attributes: { 'scenario.id': expect.any(String) } } },
    ),
    advancementSucceeded: assertion<{ id: string; to: string }>(
      { telemetry: { span: 'workspace.scenario.advance', attributes: { 'scenario.stage.to': expect.any(String) } } },
    ),
    transitionRecorded: assertion<{ id: string; from: string; to: string; by: string }>(
      { telemetry: { span: 'workspace.scenario.advance', attributes: { 'scenario.stage.from': expect.any(String), 'scenario.stage.to': expect.any(String) } } },
    ),
    questionExists: assertion<{ scenarioId: string; text: string }>(
      { telemetry: { span: 'workspace.question.add', attributes: { 'question.id': expect.any(String) } } },
    ),
    questionResolved: assertion<{ scenarioId: string; questionId: string; answer: string }>(
      { telemetry: { span: 'workspace.question.resolve', attributes: { 'question.id': expect.any(String) } } },
    ),
    domainLinksAre: assertion<{ id: string; domainOperation?: string; testNames?: string[] }>(
      { telemetry: { span: 'workspace.scenario.link', attributes: { 'scenario.id': expect.any(String) } } },
    ),
    scenarioCountIs: assertion<{ count: number }>(
      { telemetry: { span: 'workspace.scenario.summary', attributes: { 'scenario.total': expect.any(Number) } } },
    ),
    stageCountIs: assertion<{ stage: string; count: number }>(
      { telemetry: { span: 'workspace.scenario.summary', attributes: { 'scenario.total': expect.any(Number) } } },
    ),
    filterReturns: assertion<{ count: number }>(),
    importResultIs: assertion<{ added: number; skipped: number }>(),
    exportContains: assertion<{ format: string; text: string }>(),
    operationFailed: assertion<{ message: string }>(),
  },
})
