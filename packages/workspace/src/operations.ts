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

export interface AdvanceResult {
  scenario: Scenario
  warnings: string[]
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

function validateAdvancement(scenario: Scenario, from: Stage, to: Stage): string[] {
  const warnings: string[] = []

  if (from === 'characterized' && to === 'mapped') {
    if (scenario.rules.length === 0 && scenario.examples.length === 0) {
      warnings.push('Advancing to mapped with no rules or examples. Consider adding rules/examples first.')
    }
  }

  if (from === 'mapped' && to === 'specified') {
    const openQuestions = scenario.questions.filter(q => !q.answer).length
    if (openQuestions > 0) {
      warnings.push(`Advancing to specified with ${openQuestions} open question(s). Consider resolving them first.`)
    }
  }

  if (from === 'specified' && to === 'implemented') {
    if (!scenario.domainOperation && (!scenario.testNames || scenario.testNames.length === 0)) {
      warnings.push('Advancing to implemented with no domain links. Consider linking to domain operations/tests first.')
    }
  }

  return warnings
}

export class WorkspaceOps {
  constructor(private store: WorkspaceStore) {}

  async captureScenario(input: {
    behavior: string
    context?: string
    story?: string
    mode?: 'observed' | 'intended'
  }): Promise<Scenario> {
    let captured!: Scenario
    await this.store.mutate(ws => {
      captured = createScenario({
        stage: 'captured',
        behavior: input.behavior,
        context: input.context,
        story: input.story,
        mode: input.mode ?? 'observed'
      })
      ws.scenarios.push(captured)
      return ws
    })
    return captured
  }

  async advanceScenario(id: string, input: AdvanceInput): Promise<AdvanceResult> {
    let advanced!: Scenario
    let warnings: string[] = []
    await this.store.mutate(ws => {
      const scenario = ws.scenarios.find(s => s.id === id)
      if (!scenario) throw new Error('Scenario not found: ' + id)

      const next = nextStage(scenario.stage)
      if (!next) throw new Error('Cannot advance beyond implemented')

      warnings = validateAdvancement(scenario, scenario.stage, next)

      scenario.promotedFrom = scenario.stage
      scenario.promotedBy = input.promotedBy
      scenario.stage = next
      scenario.updatedAt = new Date().toISOString()
      advanced = scenario
      return ws
    })
    return { scenario: advanced, warnings }
  }

  async regressScenario(id: string, input: RegressInput): Promise<Scenario> {
    let regressed!: Scenario
    await this.store.mutate(ws => {
      const scenario = ws.scenarios.find(s => s.id === id)
      if (!scenario) throw new Error('Scenario not found: ' + id)

      const currentIdx = STAGE_ORDER.indexOf(scenario.stage)
      const targetIdx = STAGE_ORDER.indexOf(input.targetStage)
      if (targetIdx >= currentIdx) throw new Error('Cannot regress to a later stage')

      scenario.promotedFrom = scenario.stage
      scenario.regressionRationale = input.rationale
      scenario.stage = input.targetStage
      scenario.updatedAt = new Date().toISOString()
      regressed = scenario
      return ws
    })
    return regressed
  }

  async deleteScenario(id: string): Promise<void> {
    await this.store.mutate(ws => {
      const idx = ws.scenarios.findIndex(s => s.id === id)
      if (idx === -1) throw new Error('Scenario not found: ' + id)
      ws.scenarios.splice(idx, 1)
      return ws
    })
  }

  async addQuestion(scenarioId: string, text: string): Promise<Question> {
    let question!: Question
    await this.store.mutate(ws => {
      const scenario = ws.scenarios.find(s => s.id === scenarioId)
      if (!scenario) throw new Error('Scenario not found: ' + scenarioId)

      question = {
        id: randomUUID().replace(/-/g, '').slice(0, 8),
        text
      }
      scenario.questions.push(question)
      scenario.updatedAt = new Date().toISOString()
      return ws
    })
    return question
  }

  async resolveQuestion(scenarioId: string, questionId: string, answer: string): Promise<void> {
    await this.store.mutate(ws => {
      const scenario = ws.scenarios.find(s => s.id === scenarioId)
      if (!scenario) throw new Error('Scenario not found: ' + scenarioId)

      const question = scenario.questions.find(q => q.id === questionId)
      if (!question) throw new Error('Question not found: ' + questionId)

      question.answer = answer
      question.resolvedAt = new Date().toISOString()
      scenario.updatedAt = new Date().toISOString()
      return ws
    })
  }

  async linkToDomain(scenarioId: string, links: {
    domainOperation?: string
    testNames?: string[]
    approvalBaseline?: string
  }): Promise<void> {
    await this.store.mutate(ws => {
      const scenario = ws.scenarios.find(s => s.id === scenarioId)
      if (!scenario) throw new Error('Scenario not found: ' + scenarioId)

      if (links.domainOperation) scenario.domainOperation = links.domainOperation
      if (links.testNames) scenario.testNames = links.testNames
      if (links.approvalBaseline) scenario.approvalBaseline = links.approvalBaseline
      scenario.updatedAt = new Date().toISOString()
      return ws
    })
  }

  async getScenario(id: string): Promise<Scenario | undefined> {
    const ws = await this.store.load()
    return ws.scenarios.find(s => s.id === id)
  }

  async getScenarios(filter?: ScenarioFilter): Promise<Scenario[]> {
    const ws = await this.store.load()
    let scenarios = ws.scenarios
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

  async getScenarioSummary(): Promise<ScenarioSummary> {
    const ws = await this.store.load()
    const scenarios = ws.scenarios
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

  async getAdvanceCandidates(): Promise<Scenario[]> {
    const ws = await this.store.load()
    return ws.scenarios.filter(s => {
      if (s.stage === 'implemented') return false
      const openQuestions = s.questions.filter(q => !q.answer).length
      return openQuestions === 0
    })
  }
}
