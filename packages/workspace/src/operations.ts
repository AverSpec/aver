import { randomUUID } from 'node:crypto'
import { createItem, type WorkspaceItem, type Stage, type Question } from './types.js'
import type { WorkspaceStore } from './storage.js'

const STAGE_ORDER: Stage[] = ['observed', 'explored', 'intended', 'formalized']

function nextStage(current: Stage): Stage | null {
  const idx = STAGE_ORDER.indexOf(current)
  return idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null
}

export interface PromoteInput {
  rationale: string
  promotedBy: string
}

export interface DemoteInput {
  targetStage: Stage
  rationale: string
}

export interface ItemFilter {
  stage?: Stage
  story?: string
  keyword?: string
}

export interface WorkspaceSummary {
  observed: number
  explored: number
  intended: number
  formalized: number
  total: number
  openQuestions: number
}

export class WorkspaceOps {
  constructor(private store: WorkspaceStore) {}

  recordObservation(input: { behavior: string; context?: string }): WorkspaceItem {
    const item = createItem({ stage: 'observed', behavior: input.behavior, context: input.context })
    const ws = this.store.load()
    ws.items.push(item)
    this.store.save(ws)
    return item
  }

  recordIntent(input: { behavior: string; story?: string; context?: string }): WorkspaceItem {
    const item = createItem({ stage: 'intended', behavior: input.behavior, story: input.story, context: input.context })
    const ws = this.store.load()
    ws.items.push(item)
    this.store.save(ws)
    return item
  }

  promoteItem(id: string, input: PromoteInput): WorkspaceItem {
    const ws = this.store.load()
    const item = ws.items.find(i => i.id === id)
    if (!item) throw new Error('Item not found: ' + id)

    const next = nextStage(item.stage)
    if (!next) throw new Error('Cannot promote beyond formalized')

    item.promotedFrom = item.stage
    item.promotedBy = input.promotedBy
    item.stage = next
    item.updatedAt = new Date().toISOString()
    this.store.save(ws)
    return item
  }

  demoteItem(id: string, input: DemoteInput): WorkspaceItem {
    const ws = this.store.load()
    const item = ws.items.find(i => i.id === id)
    if (!item) throw new Error('Item not found: ' + id)

    const currentIdx = STAGE_ORDER.indexOf(item.stage)
    const targetIdx = STAGE_ORDER.indexOf(input.targetStage)
    if (targetIdx >= currentIdx) throw new Error('Cannot demote to a later stage')

    item.promotedFrom = item.stage
    item.stage = input.targetStage
    item.updatedAt = new Date().toISOString()
    this.store.save(ws)
    return item
  }

  addQuestion(itemId: string, text: string): Question {
    const ws = this.store.load()
    const item = ws.items.find(i => i.id === itemId)
    if (!item) throw new Error('Item not found: ' + itemId)

    const question: Question = {
      id: randomUUID().replace(/-/g, '').slice(0, 8),
      text
    }
    item.questions.push(question)
    item.updatedAt = new Date().toISOString()
    this.store.save(ws)
    return question
  }

  resolveQuestion(itemId: string, questionId: string, answer: string): void {
    const ws = this.store.load()
    const item = ws.items.find(i => i.id === itemId)
    if (!item) throw new Error('Item not found: ' + itemId)

    const question = item.questions.find(q => q.id === questionId)
    if (!question) throw new Error('Question not found: ' + questionId)

    question.answer = answer
    question.resolvedAt = new Date().toISOString()
    item.updatedAt = new Date().toISOString()
    this.store.save(ws)
  }

  linkToDomain(itemId: string, links: {
    domainOperation?: string
    testNames?: string[]
    approvalBaseline?: string
  }): void {
    const ws = this.store.load()
    const item = ws.items.find(i => i.id === itemId)
    if (!item) throw new Error('Item not found: ' + itemId)

    if (links.domainOperation) item.domainOperation = links.domainOperation
    if (links.testNames) item.testNames = links.testNames
    if (links.approvalBaseline) item.approvalBaseline = links.approvalBaseline
    item.updatedAt = new Date().toISOString()
    this.store.save(ws)
  }

  getItem(id: string): WorkspaceItem | undefined {
    return this.store.load().items.find(i => i.id === id)
  }

  getItems(filter?: ItemFilter): WorkspaceItem[] {
    let items = this.store.load().items
    if (filter?.stage) items = items.filter(i => i.stage === filter.stage)
    if (filter?.story) items = items.filter(i => i.story === filter.story)
    if (filter?.keyword) {
      const kw = filter.keyword.toLowerCase()
      items = items.filter(i =>
        i.behavior.toLowerCase().includes(kw) ||
        (i.context?.toLowerCase().includes(kw) ?? false)
      )
    }
    return items
  }

  getSummary(): WorkspaceSummary {
    const items = this.store.load().items
    const openQuestions = items.reduce(
      (count, item) => count + item.questions.filter(q => !q.answer).length,
      0
    )
    return {
      observed: items.filter(i => i.stage === 'observed').length,
      explored: items.filter(i => i.stage === 'explored').length,
      intended: items.filter(i => i.stage === 'intended').length,
      formalized: items.filter(i => i.stage === 'formalized').length,
      total: items.length,
      openQuestions
    }
  }

  getPromotionCandidates(): WorkspaceItem[] {
    const items = this.store.load().items
    return items.filter(i => {
      if (i.stage === 'formalized') return false
      const openQuestions = i.questions.filter(q => !q.answer).length
      return openQuestions === 0
    })
  }
}
