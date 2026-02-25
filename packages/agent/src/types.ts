import type { Workspace, Scenario, Stage } from '@aver/workspace'

// --- Agent Session ---

export interface AgentSession {
  id: string
  goal: string
  status: 'running' | 'paused' | 'stopped' | 'complete' | 'error'
  cycleCount: number
  workerCount: number
  tokenUsage: { supervisor: number; worker: number }
  lastError?: string
  createdAt: string
  updatedAt: string
}

// --- Agent Config ---

export interface AgentConfig {
  auth?: {
    provider?: 'anthropic' | 'bedrock' | 'vertex' | 'azure'
    apiKey?: string
  }
  model: {
    supervisor: string
    worker: string
  }
  cycles: {
    checkpointInterval: number
    rollupThreshold: number
    maxWorkerIterations: number
    maxCycleDepth?: number
  }
  dashboard: {
    port: number
  }
  /** Path to the Claude Code executable. Auto-detected if not set. */
  claudeExecutablePath?: string
}

export const DEFAULT_CONFIG: AgentConfig = {
  model: {
    supervisor: 'claude-sonnet-4-5-20250929',
    worker: 'claude-opus-4-6',
  },
  cycles: {
    checkpointInterval: 10,
    rollupThreshold: 3,
    maxWorkerIterations: 15,
  },
  dashboard: {
    port: 4700,
  },
}

// --- Artifacts ---

export type ArtifactType =
  | 'investigation'
  | 'seam-analysis'
  | 'test-snapshot'
  | 'decision-log'
  | 'checkpoint'
  | 'rollup'
  | 'story-complete'

export interface ArtifactEntry {
  name: string
  type: ArtifactType
  summary: string
  scenarioId?: string
  createdAt: string
}

export interface NewArtifact {
  type: ArtifactType
  name: string
  summary: string
  content: string
  scenarioId?: string
}

export interface ArtifactContent extends ArtifactEntry {
  content: string
}

// --- Events ---

export type EventType =
  | 'cycle:start'
  | 'cycle:end'
  | 'worker:dispatch'
  | 'worker:result'
  | 'user:message'
  | 'user:answer'
  | 'decision'
  | 'checkpoint'
  | 'advancement:blocked'
  | 'advancement:warning'

export interface AgentEvent {
  timestamp: string
  type: EventType
  cycleId: string
  data: Record<string, unknown>
}

// --- Supervisor Protocol ---

export interface WorkspaceSnapshot {
  projectId: string
  scenarios: Scenario[]
  createdAt: string
  updatedAt: string
}

export interface SupervisorInput {
  trigger: 'workers_complete' | 'user_message' | 'timer' | 'startup'
  projectContext: string
  workspace: WorkspaceSnapshot
  checkpointChain: string[]
  recentEvents: AgentEvent[]
  storySummaries: string[]
  artifactIndex: ArtifactEntry[]
  userMessage?: string
  workerResults?: WorkerResult[]
}

export interface WorkerDispatch {
  goal: string
  artifacts: string[]
  skill: string
  allowUserQuestions: boolean
  permissionLevel: 'read_only' | 'edit' | 'full'
  scenarioId?: string
}

export interface SupervisorDecision {
  action:
    | { type: 'dispatch_worker'; worker: WorkerDispatch }
    | { type: 'dispatch_workers'; workers: WorkerDispatch[] }
    | { type: 'ask_user'; question: string; options?: string[] }
    | { type: 'checkpoint'; summary: string }
    | { type: 'complete_story'; scenarioId: string; summary: string; projectConstraints?: string[] }
    | { type: 'update_workspace'; updates: ScenarioUpdate[] }
    | { type: 'stop'; reason: string }
  messageToUser?: string
}

export interface ScenarioUpdate {
  scenarioId: string
  stage?: Stage
  rationale?: string
}

// --- Worker Protocol ---

export interface WorkerInput {
  goal: string
  artifacts: ArtifactContent[]
  domainVocabulary?: string
  scenarioDetail?: Scenario
  permissionLevel?: 'read_only' | 'edit' | 'full'
  projectContext?: string
}

export interface WorkerResult {
  summary: string
  artifacts: NewArtifact[]
  scenarioUpdates?: ScenarioUpdate[]
  suggestedNext?: string
  filesChanged?: string[]
  status?: 'complete' | 'stuck'
  tokenUsage?: number
}
