import { randomUUID } from 'node:crypto'

export type BacklogStatus = 'open' | 'in-progress' | 'done' | 'dismissed'
export type BacklogPriority = 'P0' | 'P1' | 'P2' | 'P3'
export type BacklogItemType = 'feature' | 'bug' | 'research' | 'refactor' | 'chore'

export interface BacklogItemReference {
  label: string
  path: string
}

export interface BacklogItem {
  id: string
  title: string
  description?: string
  status: BacklogStatus
  priority: BacklogPriority
  rank: string

  type?: BacklogItemType
  tags?: string[]

  references?: BacklogItemReference[]
  externalUrl?: string
  scenarioIds?: string[]

  createdAt: string
  updatedAt: string
}

export interface BacklogFilter {
  status?: BacklogStatus
  priority?: BacklogPriority
  type?: BacklogItemType
  tag?: string
}

export interface BacklogSummary {
  open: number
  'in-progress': number
  done: number
  dismissed: number
  total: number
  byPriority: Record<BacklogPriority, number>
}

export interface BacklogMoveTarget {
  priority?: BacklogPriority
  after?: string
  before?: string
}

export type BacklogItemUpdateInput = Partial<{
  title: string
  description: string
  status: BacklogStatus
  priority: BacklogPriority
  type: BacklogItemType
  tags: string[]
  references: BacklogItemReference[]
  externalUrl: string
  scenarioIds: string[]
}>

function shortId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 8)
}

export function createBacklogItem(input: {
  title: string
  description?: string
  priority?: BacklogPriority
  type?: BacklogItemType
  tags?: string[]
  references?: BacklogItemReference[]
  externalUrl?: string
  scenarioIds?: string[]
  rank: string
}): BacklogItem {
  const now = new Date().toISOString()
  return {
    id: shortId(),
    title: input.title,
    description: input.description,
    status: 'open',
    priority: input.priority ?? 'P1',
    rank: input.rank,
    type: input.type,
    tags: input.tags,
    references: input.references,
    externalUrl: input.externalUrl,
    scenarioIds: input.scenarioIds,
    createdAt: now,
    updatedAt: now,
  }
}
