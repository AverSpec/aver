import { describe, it, expect } from 'vitest'
import type {
  SupervisorInput,
  SupervisorDecision,
  WorkerDispatch,
  WorkerInput,
  WorkerResult,
  AgentEvent,
  ArtifactEntry,
  NewArtifact,
  AgentSession,
  AgentConfig,
} from '../../src/types.js'

describe('protocol types', () => {
  it('SupervisorInput has all required fields', () => {
    const input: SupervisorInput = {
      trigger: 'startup',
      projectContext: 'test project',
      workspace: { projectId: 'test', scenarios: [], createdAt: '', updatedAt: '' },
      checkpointChain: [],
      recentEvents: [],
      storySummaries: [],
      artifactIndex: [],
    }
    expect(input.trigger).toBe('startup')
  })

  it('SupervisorDecision dispatch_worker action', () => {
    const decision: SupervisorDecision = {
      action: {
        type: 'dispatch_worker',
        worker: {
          goal: 'investigate auth',
          artifacts: [],
          skill: 'investigation',
          allowUserQuestions: true,
          permissionLevel: 'read_only',
        },
      },
    }
    expect(decision.action.type).toBe('dispatch_worker')
  })

  it('SupervisorDecision dispatch_workers action', () => {
    const decision: SupervisorDecision = {
      action: {
        type: 'dispatch_workers',
        workers: [
          { goal: 'investigate auth', artifacts: [], skill: 'investigation', allowUserQuestions: false, permissionLevel: 'read_only' },
          { goal: 'investigate checkout', artifacts: [], skill: 'investigation', allowUserQuestions: false, permissionLevel: 'read_only' },
        ],
      },
    }
    expect(decision.action.type).toBe('dispatch_workers')
  })

  it('WorkerResult has all required fields', () => {
    const result: WorkerResult = {
      summary: 'Found 3 seams',
      artifacts: [{ type: 'investigation', name: 'auth', summary: 'auth investigation', content: '...' }],
    }
    expect(result.summary).toBe('Found 3 seams')
  })

  it('AgentEvent has timestamp and type', () => {
    const event: AgentEvent = {
      timestamp: '2026-02-19T00:00:00Z',
      type: 'cycle:start',
      cycleId: 'cycle-001',
      data: {},
    }
    expect(event.type).toBe('cycle:start')
  })

  it('AgentSession tracks session metadata', () => {
    const session: AgentSession = {
      id: 'session-001',
      goal: 'add task cancellation',
      status: 'running',
      cycleCount: 0,
      workerCount: 0,
      tokenUsage: { supervisor: 0, worker: 0 },
      createdAt: '2026-02-19T00:00:00Z',
      updatedAt: '2026-02-19T00:00:00Z',
    }
    expect(session.status).toBe('running')
  })

  it('AgentConfig has auth, model, cycles, dashboard', () => {
    const config: AgentConfig = {
      model: { supervisor: 'claude-sonnet-4-5-20250929', worker: 'claude-opus-4-6' },
      cycles: { checkpointInterval: 10, rollupThreshold: 3, maxWorkerIterations: 15 },
      dashboard: { port: 4700 },
    }
    expect(config.cycles.checkpointInterval).toBe(10)
  })
})
