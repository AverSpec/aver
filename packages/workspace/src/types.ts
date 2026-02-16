import { randomUUID } from 'node:crypto'

export type Stage = 'observed' | 'explored' | 'intended' | 'formalized'

export interface Example {
  description: string
  expectedOutcome: string
  given?: string
}

export interface Question {
  id: string
  text: string
  answer?: string
  resolvedAt?: string
}

export interface WorkspaceItem {
  id: string
  stage: Stage
  behavior: string
  context?: string

  // Example Mapping
  story?: string
  rules: string[]
  examples: Example[]
  questions: Question[]

  // Technical grounding
  constraints: string[]
  seams: string[]

  // Provenance
  promotedBy?: string
  promotedFrom?: Stage
  humanConfirmed?: boolean
  createdAt: string
  updatedAt: string

  // Links to formalized artifacts
  domainOperation?: string
  testNames?: string[]
  approvalBaseline?: string
}

export interface Workspace {
  projectId: string
  items: WorkspaceItem[]
  createdAt: string
  updatedAt: string
}

function shortId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 8)
}

export function createItem(input: {
  stage: Stage
  behavior: string
  context?: string
  story?: string
}): WorkspaceItem {
  const now = new Date().toISOString()
  return {
    id: shortId(),
    stage: input.stage,
    behavior: input.behavior,
    context: input.context,
    story: input.story,
    rules: [],
    examples: [],
    questions: [],
    constraints: [],
    seams: [],
    createdAt: now,
    updatedAt: now
  }
}

export function createExample(input: {
  description: string
  expectedOutcome: string
  given?: string
}): Example {
  return {
    description: input.description,
    expectedOutcome: input.expectedOutcome,
    given: input.given
  }
}
