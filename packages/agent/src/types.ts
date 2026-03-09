import type { Workspace, Scenario, Stage } from './workspace/types.js'

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
    maxCycleDepth?: number
  }
  /**
   * Timeout configuration for LLM API calls.
   * Prevents hung SDK calls from blocking the engine indefinitely.
   */
  timeouts?: {
    /**
     * Maximum time in milliseconds for a single supervisor `query()` call.
     * Defaults to 120_000 (2 minutes).
     */
    supervisorCallMs?: number
    /**
     * Maximum time in milliseconds per turn for a worker `query()` call.
     * Defaults to 180_000 (3 minutes).
     */
    workerTurnMs?: number
    /**
     * Maximum total time in milliseconds for an entire worker dispatch,
     * spanning all turns. Defaults to 1_800_000 (30 minutes).
     */
    workerTotalMs?: number
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
  },
  timeouts: {
    supervisorCallMs: 120_000,
    workerTurnMs: 180_000,
    workerTotalMs: 1_800_000,
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
  | 'session:start'
  | 'session:stop'
  | 'supervisor:decision'
  | 'worker:created'
  | 'worker:goal_assigned'
  | 'worker:terminated'
  | 'worker:complete'
  | 'worker:error'
  | 'human:answer'
  | 'scenario:advanced'
  | 'scenario:update_requested'
  | 'advancement:blocked'
  | 'advancement:warning'
  | 'error'

export interface AgentEvent {
  timestamp: string
  type: EventType
  agentId?: string
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
  failedWorkers?: FailedWorker[]
}

export interface WorkerDispatch {
  goal: string
  artifacts: string[]
  skill: string
  allowUserQuestions: boolean
  permissionLevel: 'read_only' | 'edit' | 'full'
  scenarioId?: string
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

export interface FailedWorker {
  goal: string
  error: string
}
