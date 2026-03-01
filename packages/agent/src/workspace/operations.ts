import { randomUUID } from 'node:crypto'
import { createScenario, type Scenario, type Stage, type Question, type Example, type Seam } from './types.js'
import type { WorkspaceStore } from './storage.js'

export const STAGE_ORDER: Stage[] = ['captured', 'characterized', 'mapped', 'specified', 'implemented']

export function nextStage(current: Stage): Stage | null {
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

export interface RevisitInput {
  targetStage: Stage
  rationale: string
}

export interface ScenarioFilter {
  stage?: Stage
  story?: string
  keyword?: string
  mode?: 'observed' | 'intended'
  hasConfirmation?: boolean
  domainOperation?: string
  hasOpenQuestions?: boolean
  createdAfter?: string
  createdBefore?: string
  fields?: string[]
}

export interface ScenarioUpdateInput {
  behavior?: string
  context?: string
  story?: string
  rules?: string[]
  examples?: Example[]
  constraints?: string[]
  seams?: Seam[]
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

export interface AdvancementVerification {
  blocked: boolean
  hardBlocks: string[]
  warnings: string[]
}

/**
 * Unified advancement verification — single source of truth for all callers.
 * Returns hard blocks (prevent advancement) and warnings (advisory only).
 */
export function verifyAdvancement(scenario: Scenario, from: Stage, to: Stage): AdvancementVerification {
  const hardBlocks: string[] = []
  const warnings: string[] = []

  // Hard block: characterized -> mapped requires confirmedBy
  if (from === 'characterized' && to === 'mapped') {
    if (!scenario.confirmedBy) {
      hardBlocks.push('Cannot advance to mapped: confirmedBy is required (human must confirm intent)')
    }
    if (scenario.rules.length === 0 && scenario.examples.length === 0) {
      warnings.push('Advancing to mapped with no rules or examples. Consider adding rules/examples first.')
    }
  }

  // Hard block: mapped -> specified with open questions
  if (from === 'mapped' && to === 'specified') {
    const openQuestions = scenario.questions.filter(q => !q.answer).length
    if (openQuestions > 0) {
      hardBlocks.push(`Cannot advance to specified: ${openQuestions} open question(s) must be resolved first`)
    }
  }

  // Hard block: specified -> implemented without domain links
  if (from === 'specified' && to === 'implemented') {
    const hasDomainLinks = !!(scenario.domainOperation || (scenario.testNames && scenario.testNames.length > 0))
    if (!hasDomainLinks) {
      hardBlocks.push('Cannot advance to implemented: no domain links (domainOperation or testNames required)')
    }
  }

  // Conditional warning: captured -> characterized for observed mode without evidence
  if (from === 'captured' && to === 'characterized') {
    if (scenario.mode === 'observed') {
      const hasEvidence = scenario.seams.length > 0 || scenario.constraints.length > 0
      if (!hasEvidence) {
        warnings.push('Advancing with no investigation evidence (no seams or constraints identified)')
      }
    }
  }

  return {
    blocked: hardBlocks.length > 0,
    hardBlocks,
    warnings,
  }
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

  async updateScenario(id: string, updates: ScenarioUpdateInput): Promise<Scenario> {
    let updated!: Scenario
    await this.store.mutate(ws => {
      const scenario = ws.scenarios.find(s => s.id === id)
      if (!scenario) throw new Error('Scenario not found: ' + id)

      if (updates.behavior !== undefined) scenario.behavior = updates.behavior
      if (updates.context !== undefined) scenario.context = updates.context
      if (updates.story !== undefined) scenario.story = updates.story
      if (updates.rules !== undefined) scenario.rules = updates.rules
      if (updates.examples !== undefined) scenario.examples = updates.examples
      if (updates.constraints !== undefined) scenario.constraints = updates.constraints
      if (updates.seams !== undefined) scenario.seams = updates.seams

      scenario.updatedAt = new Date().toISOString()
      updated = scenario
      return ws
    })
    return updated
  }

  async advanceScenario(id: string, input: AdvanceInput): Promise<AdvanceResult> {
    let advanced!: Scenario
    let warnings: string[] = []
    await this.store.mutate(ws => {
      const scenario = ws.scenarios.find(s => s.id === id)
      if (!scenario) throw new Error('Scenario not found: ' + id)

      const next = nextStage(scenario.stage)
      if (!next) throw new Error('Cannot advance beyond implemented')

      const verification = verifyAdvancement(scenario, scenario.stage, next)
      if (verification.blocked) {
        throw new Error(verification.hardBlocks[0])
      }
      warnings = verification.warnings

      const from = scenario.stage
      const now = new Date().toISOString()

      // Ensure transitions array exists (backward compat with pre-existing data)
      if (!scenario.transitions) scenario.transitions = []

      scenario.transitions.push({
        from,
        to: next,
        at: now,
        by: input.promotedBy,
        rationale: input.rationale,
      })

      scenario.promotedFrom = from
      scenario.promotedBy = input.promotedBy
      scenario.stage = next
      scenario.updatedAt = now
      advanced = scenario
      return ws
    })
    return { scenario: advanced, warnings }
  }

  async revisitScenario(id: string, input: RevisitInput): Promise<Scenario> {
    let revisited!: Scenario
    await this.store.mutate(ws => {
      const scenario = ws.scenarios.find(s => s.id === id)
      if (!scenario) throw new Error('Scenario not found: ' + id)

      const currentIdx = STAGE_ORDER.indexOf(scenario.stage)
      const targetIdx = STAGE_ORDER.indexOf(input.targetStage)
      if (targetIdx >= currentIdx) throw new Error('Cannot revisit to a later or same stage')

      const from = scenario.stage
      const now = new Date().toISOString()

      // Ensure transitions array exists (backward compat with pre-existing data)
      if (!scenario.transitions) scenario.transitions = []

      scenario.transitions.push({
        from,
        to: input.targetStage,
        at: now,
        rationale: input.rationale,
      })

      scenario.promotedFrom = from
      scenario.revisitRationale = input.rationale

      // Strip fields owned by stages we're moving past
      // confirmedBy is the gate to 'mapped' (index 2) — clear if target < characterized (index 1)
      if (targetIdx < 1) {
        scenario.confirmedBy = undefined
      }
      // domain links are the gate to 'implemented' (index 4) — clear if target < specified (index 3)
      if (targetIdx < 3) {
        scenario.domainOperation = undefined
        scenario.testNames = undefined
        scenario.approvalBaseline = undefined
      }

      scenario.stage = input.targetStage
      scenario.updatedAt = now
      revisited = scenario
      return ws
    })
    return revisited
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

  async confirmScenario(id: string, confirmer: string): Promise<void> {
    await this.store.mutate(ws => {
      const scenario = ws.scenarios.find(s => s.id === id)
      if (!scenario) throw new Error('Scenario not found: ' + id)
      scenario.confirmedBy = confirmer
      scenario.updatedAt = new Date().toISOString()
      return ws
    })
  }

  async getScenario(id: string): Promise<Scenario | undefined> {
    const ws = await this.store.load()
    return ws.scenarios.find(s => s.id === id)
  }

  async getScenarios(filter?: ScenarioFilter): Promise<Scenario[] | Partial<Scenario>[]> {
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
    if (filter?.mode) scenarios = scenarios.filter(s => s.mode === filter.mode)
    if (filter?.hasConfirmation !== undefined) {
      scenarios = scenarios.filter(s => filter.hasConfirmation ? !!s.confirmedBy : !s.confirmedBy)
    }
    if (filter?.domainOperation) {
      const op = filter.domainOperation.toLowerCase()
      scenarios = scenarios.filter(s => s.domainOperation?.toLowerCase().includes(op) ?? false)
    }
    if (filter?.hasOpenQuestions !== undefined) {
      scenarios = scenarios.filter(s => {
        const hasOpen = s.questions.some(q => !q.answer)
        return filter.hasOpenQuestions ? hasOpen : !hasOpen
      })
    }
    if (filter?.createdAfter) {
      scenarios = scenarios.filter(s => s.createdAt >= filter.createdAfter!)
    }
    if (filter?.createdBefore) {
      scenarios = scenarios.filter(s => s.createdAt <= filter.createdBefore!)
    }
    if (filter?.fields && filter.fields.length > 0) {
      return scenarios.map(s => {
        const projected: Record<string, unknown> = {}
        for (const f of filter.fields!) {
          if (f in s) projected[f] = (s as unknown as Record<string, unknown>)[f]
        }
        return projected as Partial<Scenario>
      })
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
