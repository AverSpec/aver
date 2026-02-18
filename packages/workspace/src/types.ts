import { randomUUID } from 'node:crypto'

export type Stage = 'captured' | 'characterized' | 'mapped' | 'specified' | 'implemented'

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

export interface Scenario {
  id: string
  stage: Stage
  behavior: string
  context?: string
  mode?: 'observed' | 'intended'

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
  regressionRationale?: string
  humanConfirmed?: boolean
  createdAt: string
  updatedAt: string

  // Links to domain artifacts
  domainOperation?: string
  testNames?: string[]
  approvalBaseline?: string
}

export interface Workspace {
  projectId: string
  scenarios: Scenario[]
  createdAt: string
  updatedAt: string
}

function shortId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 8)
}

export function createScenario(input: {
  stage: Stage
  behavior: string
  context?: string
  story?: string
  mode?: 'observed' | 'intended'
}): Scenario {
  const now = new Date().toISOString()
  return {
    id: shortId(),
    stage: input.stage,
    behavior: input.behavior,
    context: input.context,
    mode: input.mode,
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
