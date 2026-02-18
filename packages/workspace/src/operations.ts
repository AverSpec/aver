import { randomUUID } from 'node:crypto'
import { createScenario, type Scenario, type Stage, type Question } from './types.js'
import type { WorkspaceStore } from './storage.js'

const STAGE_ORDER: Stage[] = ['captured', 'characterized', 'mapped', 'specified', 'implemented']

function nextStage(current: Stage): Stage | null {
  const idx = STAGE_ORDER.indexOf(current)
  return idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null
}

export interface AdvanceInput {
  rationale: string
  promotedBy: string
}

export interface RegressInput {
  targetStage: Stage
  rationale: string
}

export interface ScenarioFilter {
  stage?: Stage
  story?: string
  keyword?: string
}

export interface ScenarioSummary {
  captured: number
  characterized: number
  mapped: number
  specified: number
  implemented: number
  total: number
  openQuestions: number
}

export class WorkspaceOps {
  constructor(private store: WorkspaceStore) {}

  captureScenario(input: {
    behavior: string
    context?: string
    story?: string
    mode?: 'observed' | 'intended'
  }): Scenario {
    const scenario = createScenario({
      stage: 'captured',
      behavior: input.behavior,
      context: input.context,
      story: input.story,
      mode: input.mode ?? 'observed'
    })
    const ws = this.store.load()
    ws.scenarios.push(scenario)
    this.store.save(ws)
    return scenario
  }

  advanceScenario(id: string, input: AdvanceInput): Scenario {
    const ws = this.store.load()
    const scenario = ws.scenarios.find(s => s.id === id)
    if (!scenario) throw new Error('Scenario not found: ' + id)

    const next = nextStage(scenario.stage)
    if (!next) throw new Error('Cannot advance beyond implemented')

    scenario.promotedFrom = scenario.stage
    scenario.promotedBy = input.promotedBy
    scenario.stage = next
    scenario.updatedAt = new Date().toISOString()
    this.store.save(ws)
    return scenario
  }

  regressScenario(id: string, input: RegressInput): Scenario {
    const ws = this.store.load()
    const scenario = ws.scenarios.find(s => s.id === id)
    if (!scenario) throw new Error('Scenario not found: ' + id)

    const currentIdx = STAGE_ORDER.indexOf(scenario.stage)
    const targetIdx = STAGE_ORDER.indexOf(input.targetStage)
    if (targetIdx >= currentIdx) throw new Error('Cannot regress to a later stage')

    scenario.promotedFrom = scenario.stage
    scenario.stage = input.targetStage
    scenario.updatedAt = new Date().toISOString()
    this.store.save(ws)
    return scenario
  }

  addQuestion(scenarioId: string, text: string): Question {
    const ws = this.store.load()
    const scenario = ws.scenarios.find(s => s.id === scenarioId)
    if (!scenario) throw new Error('Scenario not found: ' + scenarioId)

    const question: Question = {
      id: randomUUID().replace(/-/g, '').slice(0, 8),
      text
    }
    scenario.questions.push(question)
    scenario.updatedAt = new Date().toISOString()
    this.store.save(ws)
    return question
  }

  resolveQuestion(scenarioId: string, questionId: string, answer: string): void {
    const ws = this.store.load()
    const scenario = ws.scenarios.find(s => s.id === scenarioId)
    if (!scenario) throw new Error('Scenario not found: ' + scenarioId)

    const question = scenario.questions.find(q => q.id === questionId)
    if (!question) throw new Error('Question not found: ' + questionId)

    question.answer = answer
    question.resolvedAt = new Date().toISOString()
    scenario.updatedAt = new Date().toISOString()
    this.store.save(ws)
  }

  linkToDomain(scenarioId: string, links: {
    domainOperation?: string
    testNames?: string[]
    approvalBaseline?: string
  }): void {
    const ws = this.store.load()
    const scenario = ws.scenarios.find(s => s.id === scenarioId)
    if (!scenario) throw new Error('Scenario not found: ' + scenarioId)

    if (links.domainOperation) scenario.domainOperation = links.domainOperation
    if (links.testNames) scenario.testNames = links.testNames
    if (links.approvalBaseline) scenario.approvalBaseline = links.approvalBaseline
    scenario.updatedAt = new Date().toISOString()
    this.store.save(ws)
  }

  getScenario(id: string): Scenario | undefined {
    return this.store.load().scenarios.find(s => s.id === id)
  }

  getScenarios(filter?: ScenarioFilter): Scenario[] {
    let scenarios = this.store.load().scenarios
    if (filter?.stage) scenarios = scenarios.filter(s => s.stage === filter.stage)
    if (filter?.story) scenarios = scenarios.filter(s => s.story === filter.story)
    if (filter?.keyword) {
      const kw = filter.keyword.toLowerCase()
      scenarios = scenarios.filter(s =>
        s.behavior.toLowerCase().includes(kw) ||
        (s.context?.toLowerCase().includes(kw) ?? false)
      )
    }
    return scenarios
  }

  getScenarioSummary(): ScenarioSummary {
    const scenarios = this.store.load().scenarios
    const openQuestions = scenarios.reduce(
      (count, scenario) => count + scenario.questions.filter(q => !q.answer).length,
      0
    )
    return {
      captured: scenarios.filter(s => s.stage === 'captured').length,
      characterized: scenarios.filter(s => s.stage === 'characterized').length,
      mapped: scenarios.filter(s => s.stage === 'mapped').length,
      specified: scenarios.filter(s => s.stage === 'specified').length,
      implemented: scenarios.filter(s => s.stage === 'implemented').length,
      total: scenarios.length,
      openQuestions
    }
  }

  getAdvanceCandidates(): Scenario[] {
    const scenarios = this.store.load().scenarios
    return scenarios.filter(s => {
      if (s.stage === 'implemented') return false
      const openQuestions = s.questions.filter(q => !q.answer).length
      return openQuestions === 0
    })
  }
}
