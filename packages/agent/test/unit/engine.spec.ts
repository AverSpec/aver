import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentConfig } from '../../src/types.js'
import { WorkspaceStore, WorkspaceOps } from '@aver/workspace'
import { EventLog } from '../../src/memory/events.js'

// Mock dispatch functions
vi.mock('../../src/supervisor/dispatch.js', () => ({
  dispatchSupervisor: vi.fn(),
}))
vi.mock('../../src/worker/dispatch.js', () => ({
  dispatchWorker: vi.fn(),
}))

import { CycleEngine } from '../../src/shell/engine.js'
import { dispatchSupervisor } from '../../src/supervisor/dispatch.js'
import { dispatchWorker } from '../../src/worker/dispatch.js'

const mockSupervisor = vi.mocked(dispatchSupervisor)
const mockWorker = vi.mocked(dispatchWorker)

describe('CycleEngine', () => {
  let dir: string
  let config: AgentConfig

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aver-engine-'))
    config = {
      model: { supervisor: 'sonnet', worker: 'opus' },
      cycles: { checkpointInterval: 10, rollupThreshold: 3, maxWorkerIterations: 15 },
      dashboard: { port: 4700 },
    }
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('runs a startup cycle that stops immediately', async () => {
    mockSupervisor.mockResolvedValue({
      decision: { action: { type: 'stop', reason: 'no work' } },
      tokenUsage: 100,
    })

    const engine = new CycleEngine({
      agentPath: dir,
      workspacePath: dir,
      projectId: 'test',
      config,
    })

    await engine.start('test goal')
    const session = await engine.getSession()
    expect(session!.status).toBe('stopped')
    expect(mockSupervisor).toHaveBeenCalledTimes(1)
  })

  it('dispatches a worker and runs follow-up supervisor cycle', async () => {
    // First supervisor cycle: dispatch worker
    mockSupervisor.mockResolvedValueOnce({
      decision: {
        action: {
          type: 'dispatch_worker',
          worker: {
            goal: 'investigate',
            artifacts: [],
            skill: 'investigation',
            allowUserQuestions: false,
            permissionLevel: 'read_only',
          },
        },
      },
      tokenUsage: 100,
    })

    // Worker returns
    mockWorker.mockResolvedValueOnce({
      result: { summary: 'found seams', artifacts: [], status: 'complete' },
      tokenUsage: 500,
    })

    // Second supervisor cycle: stop
    mockSupervisor.mockResolvedValueOnce({
      decision: { action: { type: 'stop', reason: 'investigation done' } },
      tokenUsage: 100,
    })

    const engine = new CycleEngine({
      agentPath: dir,
      workspacePath: dir,
      projectId: 'test',
      config,
    })

    await engine.start('investigate auth')
    expect(mockSupervisor).toHaveBeenCalledTimes(2)
    expect(mockWorker).toHaveBeenCalledTimes(1)
  })

  it('handles ask_user by pausing when no onQuestion callback', async () => {
    mockSupervisor.mockResolvedValueOnce({
      decision: {
        action: { type: 'ask_user', question: 'Which DB?', options: ['Postgres', 'SQLite'] },
      },
      tokenUsage: 100,
    })

    const engine = new CycleEngine({
      agentPath: dir,
      workspacePath: dir,
      projectId: 'test',
      config,
    })

    await engine.start('add database')
    const session = await engine.getSession()
    expect(session!.status).toBe('paused')
  })

  it('handles ask_user with onQuestion callback and resumes', async () => {
    mockSupervisor.mockResolvedValueOnce({
      decision: {
        action: { type: 'ask_user', question: 'Which DB?', options: ['Postgres', 'SQLite'] },
      },
      tokenUsage: 100,
    })

    // After user answers, supervisor stops
    mockSupervisor.mockResolvedValueOnce({
      decision: { action: { type: 'stop', reason: 'user answered' } },
      tokenUsage: 50,
    })

    const onQuestion = vi.fn().mockResolvedValue('Postgres')

    const engine = new CycleEngine({
      agentPath: dir,
      workspacePath: dir,
      projectId: 'test',
      config,
      onQuestion,
    })

    await engine.start('add database')
    expect(onQuestion).toHaveBeenCalledWith('Which DB?', ['Postgres', 'SQLite'])
    expect(mockSupervisor).toHaveBeenCalledTimes(2)
  })

  it('dispatches parallel workers and collects results', async () => {
    mockSupervisor.mockResolvedValueOnce({
      decision: {
        action: {
          type: 'dispatch_workers',
          workers: [
            { goal: 'task A', artifacts: [], skill: 'investigation', allowUserQuestions: false, permissionLevel: 'read_only' },
            { goal: 'task B', artifacts: [], skill: 'investigation', allowUserQuestions: false, permissionLevel: 'read_only' },
          ],
        },
      },
      tokenUsage: 100,
    })

    mockWorker
      .mockResolvedValueOnce({ result: { summary: 'A done', artifacts: [], status: 'complete' }, tokenUsage: 200 })
      .mockResolvedValueOnce({ result: { summary: 'B done', artifacts: [], status: 'complete' }, tokenUsage: 300 })

    mockSupervisor.mockResolvedValueOnce({
      decision: { action: { type: 'stop', reason: 'all done' } },
      tokenUsage: 50,
    })

    const engine = new CycleEngine({
      agentPath: dir,
      workspacePath: dir,
      projectId: 'test',
      config,
    })

    await engine.start('parallel work')
    expect(mockWorker).toHaveBeenCalledTimes(2)
    expect(mockSupervisor).toHaveBeenCalledTimes(2)
  })

  it('handles checkpoint action and continues', async () => {
    mockSupervisor.mockResolvedValueOnce({
      decision: {
        action: { type: 'checkpoint', summary: 'progress so far' },
      },
      tokenUsage: 100,
    })

    mockSupervisor.mockResolvedValueOnce({
      decision: { action: { type: 'stop', reason: 'done' } },
      tokenUsage: 50,
    })

    const engine = new CycleEngine({
      agentPath: dir,
      workspacePath: dir,
      projectId: 'test',
      config,
    })

    await engine.start('long task')
    expect(mockSupervisor).toHaveBeenCalledTimes(2)
  })

  it('handles complete_story action and continues', async () => {
    mockSupervisor.mockResolvedValueOnce({
      decision: {
        action: {
          type: 'complete_story',
          scenarioId: 'scenario-123',
          summary: 'auth complete',
          projectConstraints: ['must use JWT'],
        },
      },
      tokenUsage: 100,
    })

    mockSupervisor.mockResolvedValueOnce({
      decision: { action: { type: 'stop', reason: 'all stories done' } },
      tokenUsage: 50,
    })

    const engine = new CycleEngine({
      agentPath: dir,
      workspacePath: dir,
      projectId: 'test',
      config,
    })

    await engine.start('implement stories')
    expect(mockSupervisor).toHaveBeenCalledTimes(2)
  })

  it('tracks token usage across cycles', async () => {
    mockSupervisor.mockResolvedValueOnce({
      decision: {
        action: {
          type: 'dispatch_worker',
          worker: { goal: 'work', artifacts: [], skill: 'implementation', allowUserQuestions: false, permissionLevel: 'edit' },
        },
      },
      tokenUsage: 150,
    })

    mockWorker.mockResolvedValueOnce({
      result: { summary: 'done', artifacts: [], status: 'complete' },
      tokenUsage: 800,
    })

    mockSupervisor.mockResolvedValueOnce({
      decision: { action: { type: 'stop', reason: 'done' } },
      tokenUsage: 100,
    })

    const engine = new CycleEngine({
      agentPath: dir,
      workspacePath: dir,
      projectId: 'test',
      config,
    })

    await engine.start('token tracking')
    const session = await engine.getSession()
    expect(session!.tokenUsage.supervisor).toBe(250) // 150 + 100
    expect(session!.tokenUsage.worker).toBe(800)
    expect(session!.cycleCount).toBe(2)
    expect(session!.workerCount).toBe(1)
  })

  it('delivers messageToUser via onMessage callback', async () => {
    mockSupervisor.mockResolvedValueOnce({
      decision: {
        action: { type: 'stop', reason: 'done' },
        messageToUser: 'All tasks complete!',
      },
      tokenUsage: 100,
    })

    const onMessage = vi.fn()

    const engine = new CycleEngine({
      agentPath: dir,
      workspacePath: dir,
      projectId: 'test',
      config,
      onMessage,
    })

    await engine.start('msg test')
    expect(onMessage).toHaveBeenCalledWith('All tasks complete!')
  })

  it('persists worker artifacts to the artifact store', async () => {
    mockSupervisor.mockResolvedValueOnce({
      decision: {
        action: {
          type: 'dispatch_worker',
          worker: { goal: 'write doc', artifacts: [], skill: 'investigation', allowUserQuestions: false, permissionLevel: 'read_only' },
        },
      },
      tokenUsage: 100,
    })

    mockWorker.mockResolvedValueOnce({
      result: {
        summary: 'wrote findings',
        artifacts: [{ name: 'findings', type: 'investigation', content: '# Findings\nStuff found' }],
        status: 'complete',
      },
      tokenUsage: 500,
    })

    mockSupervisor.mockResolvedValueOnce({
      decision: { action: { type: 'stop', reason: 'done' } },
      tokenUsage: 50,
    })

    const engine = new CycleEngine({
      agentPath: dir,
      workspacePath: dir,
      projectId: 'test',
      config,
    })

    await engine.start('artifact test')

    // Verify the artifact was persisted by reading it back
    const artifact = await engine.readArtifact('findings')
    expect(artifact).toBeDefined()
    expect(artifact!.content).toContain('# Findings')
  })

  it('sets error status when supervisor dispatch fails', async () => {
    mockSupervisor.mockRejectedValueOnce(new Error('API key expired'))

    const engine = new CycleEngine({
      agentPath: dir,
      workspacePath: dir,
      projectId: 'test',
      config,
    })

    await engine.start('will fail')
    const session = await engine.getSession()
    expect(session!.status).toBe('error')
    expect(session!.lastError).toContain('API key expired')
  })

  it('sets error status when worker dispatch fails', async () => {
    mockSupervisor.mockResolvedValueOnce({
      decision: {
        action: {
          type: 'dispatch_worker',
          worker: { goal: 'work', artifacts: [], skill: 'implementation', allowUserQuestions: false, permissionLevel: 'edit' },
        },
      },
      tokenUsage: 100,
    })

    mockWorker.mockRejectedValueOnce(new Error('Rate limit exceeded'))

    const engine = new CycleEngine({
      agentPath: dir,
      workspacePath: dir,
      projectId: 'test',
      config,
    })

    await engine.start('worker will fail')
    const session = await engine.getSession()
    expect(session!.status).toBe('error')
    expect(session!.lastError).toContain('Rate limit exceeded')
  })

  it('sets error status when all parallel workers fail', async () => {
    mockSupervisor.mockResolvedValueOnce({
      decision: {
        action: {
          type: 'dispatch_workers',
          workers: [
            { goal: 'task A', artifacts: [], skill: 'investigation', allowUserQuestions: false, permissionLevel: 'read_only' },
            { goal: 'task B', artifacts: [], skill: 'investigation', allowUserQuestions: false, permissionLevel: 'read_only' },
          ],
        },
      },
      tokenUsage: 100,
    })

    mockWorker
      .mockRejectedValueOnce(new Error('Worker A failed'))
      .mockRejectedValueOnce(new Error('Worker B failed'))

    const engine = new CycleEngine({
      agentPath: dir,
      workspacePath: dir,
      projectId: 'test',
      config,
    })

    await engine.start('all workers fail')
    const session = await engine.getSession()
    expect(session!.status).toBe('error')
    expect(session!.lastError).toContain('All workers failed')
  })

  it('continues with successful results when some parallel workers fail', async () => {
    mockSupervisor.mockResolvedValueOnce({
      decision: {
        action: {
          type: 'dispatch_workers',
          workers: [
            { goal: 'task A', artifacts: [], skill: 'investigation', allowUserQuestions: false, permissionLevel: 'read_only' },
            { goal: 'task B', artifacts: [], skill: 'investigation', allowUserQuestions: false, permissionLevel: 'read_only' },
          ],
        },
      },
      tokenUsage: 100,
    })

    mockWorker
      .mockResolvedValueOnce({ result: { summary: 'A done', artifacts: [], status: 'complete' }, tokenUsage: 200 })
      .mockRejectedValueOnce(new Error('Worker B failed'))

    // Supervisor gets the partial results and stops
    mockSupervisor.mockResolvedValueOnce({
      decision: { action: { type: 'stop', reason: 'partial results' } },
      tokenUsage: 50,
    })

    const engine = new CycleEngine({
      agentPath: dir,
      workspacePath: dir,
      projectId: 'test',
      config,
    })

    await engine.start('partial failure')
    const session = await engine.getSession()
    expect(session!.status).toBe('stopped')
    // Engine continued with the one successful result
    expect(mockSupervisor).toHaveBeenCalledTimes(2)
  })

  it('enforces cycle depth limit', async () => {
    const limitedConfig: AgentConfig = {
      ...config,
      cycles: { ...config.cycles, maxCycleDepth: 2 },
    }

    // First cycle: checkpoint (depth 0 → triggers depth 1)
    mockSupervisor.mockResolvedValueOnce({
      decision: { action: { type: 'checkpoint', summary: 'progress' } },
      tokenUsage: 100,
    })

    // Second cycle: another checkpoint (depth 1 → triggers depth 2, which hits limit)
    mockSupervisor.mockResolvedValueOnce({
      decision: { action: { type: 'checkpoint', summary: 'more progress' } },
      tokenUsage: 100,
    })

    const engine = new CycleEngine({
      agentPath: dir,
      workspacePath: dir,
      projectId: 'test',
      config: limitedConfig,
    })

    await engine.start('deep recursion')
    const session = await engine.getSession()
    expect(session!.status).toBe('error')
    expect(session!.lastError).toContain('Cycle depth limit reached')
    // Only 2 supervisor calls — the third was blocked by depth limit
    expect(mockSupervisor).toHaveBeenCalledTimes(2)
  })

  it('resumes from paused state with user message', async () => {
    // Initial start — ask_user, no callback
    mockSupervisor.mockResolvedValueOnce({
      decision: {
        action: { type: 'ask_user', question: 'Framework?', options: ['React', 'Vue'] },
      },
      tokenUsage: 100,
    })

    const engine = new CycleEngine({
      agentPath: dir,
      workspacePath: dir,
      projectId: 'test',
      config,
    })

    await engine.start('build UI')
    let session = await engine.getSession()
    expect(session!.status).toBe('paused')

    // Resume with answer
    mockSupervisor.mockResolvedValueOnce({
      decision: { action: { type: 'stop', reason: 'user chose React' } },
      tokenUsage: 50,
    })

    await engine.resume('React')
    session = await engine.getSession()
    expect(session!.status).toBe('stopped')
    expect(mockSupervisor).toHaveBeenCalledTimes(2)
  })

  it('passes scenarioDetail to worker when scenarioId is provided', async () => {
    // Seed a scenario in the workspace
    const store = new WorkspaceStore(dir, 'test')
    const ops = new WorkspaceOps(store)
    const scenario = await ops.captureScenario({ behavior: 'test behavior', mode: 'intended' })

    // Supervisor dispatches a worker with scenarioId
    mockSupervisor.mockResolvedValueOnce({
      decision: {
        action: {
          type: 'dispatch_worker',
          worker: {
            goal: 'implement feature',
            artifacts: [],
            skill: 'implementation',
            allowUserQuestions: false,
            permissionLevel: 'edit',
            scenarioId: scenario.id,
          },
        },
      },
      tokenUsage: 100,
    })

    mockWorker.mockResolvedValueOnce({
      result: { summary: 'done', artifacts: [], status: 'complete' },
      tokenUsage: 500,
    })

    mockSupervisor.mockResolvedValueOnce({
      decision: { action: { type: 'stop', reason: 'done' } },
      tokenUsage: 50,
    })

    const engine = new CycleEngine({
      agentPath: dir,
      workspacePath: dir,
      projectId: 'test',
      config,
    })

    await engine.start('test scenario passthrough')

    // Verify mockWorker was called with scenarioDetail as 4th arg
    expect(mockWorker).toHaveBeenCalledTimes(1)
    const callArgs = mockWorker.mock.calls[0]
    expect(callArgs[3]).toBeDefined()
    expect(callArgs[3]!.id).toBe(scenario.id)
    expect(callArgs[3]!.behavior).toBe('test behavior')
  })

  it('blocks advancement when verification fails (open questions)', async () => {
    // Seed a mapped scenario with an open question
    const store = new WorkspaceStore(dir, 'test')
    const ops = new WorkspaceOps(store)

    // Create and advance a scenario to 'mapped'
    const scenario = await ops.captureScenario({ behavior: 'test behavior', mode: 'observed' })
    await ops.advanceScenario(scenario.id, { rationale: 'test', promotedBy: 'test' }) // captured -> characterized
    // Set confirmedBy before characterized -> mapped (required by unified verification)
    await store.mutate(ws => {
      const s = ws.scenarios.find(s => s.id === scenario.id)
      if (s) s.confirmedBy = 'test-confirmer'
      return ws
    })
    await ops.advanceScenario(scenario.id, { rationale: 'test', promotedBy: 'test' }) // characterized -> mapped
    await ops.addQuestion(scenario.id, 'Unanswered question?')

    // Supervisor tries to advance to specified
    mockSupervisor.mockResolvedValueOnce({
      decision: {
        action: {
          type: 'update_workspace',
          updates: [{ scenarioId: scenario.id, stage: 'specified', rationale: 'ready' }],
        },
      },
      tokenUsage: 100,
    })

    // After blocked advancement, supervisor stops
    mockSupervisor.mockResolvedValueOnce({
      decision: { action: { type: 'stop', reason: 'done' } },
      tokenUsage: 50,
    })

    const engine = new CycleEngine({
      agentPath: dir,
      workspacePath: dir,
      projectId: 'test',
      config,
    })

    await engine.start('test verification')

    // Verify scenario is still mapped (not advanced)
    const scenarios = await ops.getScenarios()
    const updated = scenarios.find((s) => s.id === scenario.id)
    expect(updated!.stage).toBe('mapped')
  })

  it('logs advancement warnings when verifyAdvancement returns warnings', async () => {
    // Seed an observed scenario at captured stage with no seams/constraints
    // verifyAdvancement(captured -> characterized) warns for observed mode without evidence
    const store = new WorkspaceStore(dir, 'test')
    const ops = new WorkspaceOps(store)
    const scenario = await ops.captureScenario({ behavior: 'observed behavior', mode: 'observed' })

    // Supervisor requests advancement to characterized
    mockSupervisor.mockResolvedValueOnce({
      decision: {
        action: {
          type: 'update_workspace',
          updates: [{ scenarioId: scenario.id, stage: 'characterized', rationale: 'moving on' }],
        },
      },
      tokenUsage: 100,
    })

    // After update_workspace, supervisor stops
    mockSupervisor.mockResolvedValueOnce({
      decision: { action: { type: 'stop', reason: 'done' } },
      tokenUsage: 50,
    })

    const engine = new CycleEngine({
      agentPath: dir,
      workspacePath: dir,
      projectId: 'test',
      config,
    })

    await engine.start('test warning path')

    // Read back events and verify the advancement:warning was logged
    const eventLog = new EventLog(dir)
    const events = await eventLog.readAll()
    const warningEvents = events.filter(e => e.type === 'advancement:warning')
    expect(warningEvents).toHaveLength(1)
    expect(warningEvents[0].data).toMatchObject({
      scenarioId: scenario.id,
      from: 'captured',
      to: 'characterized',
      warning: expect.stringContaining('no investigation evidence'),
    })

    // Verify the scenario was still advanced (warnings don't block)
    const scenarios = await ops.getScenarios()
    const updated = scenarios.find(s => s.id === scenario.id)
    expect(updated!.stage).toBe('characterized')
  })

  it('catches advanceScenario errors and logs them as advancement:blocked', async () => {
    // Seed a scenario at implemented stage — advanceScenario will throw
    // "Cannot advance beyond implemented" since there is no next stage
    const store = new WorkspaceStore(dir, 'test')
    const ops = new WorkspaceOps(store)
    const scenario = await ops.captureScenario({ behavior: 'fully done', mode: 'intended' })

    // Force scenario to implemented stage via direct store mutation
    await store.mutate(ws => {
      const s = ws.scenarios.find(s => s.id === scenario.id)
      if (s) s.stage = 'implemented'
      return ws
    })

    // Supervisor requests advancement (engine verifyAdvancement won't block,
    // but WorkspaceOps.advanceScenario will throw "Cannot advance beyond implemented")
    mockSupervisor.mockResolvedValueOnce({
      decision: {
        action: {
          type: 'update_workspace',
          updates: [{ scenarioId: scenario.id, stage: 'implemented', rationale: 'try again' }],
        },
      },
      tokenUsage: 100,
    })

    // After the failed advance, supervisor stops
    mockSupervisor.mockResolvedValueOnce({
      decision: { action: { type: 'stop', reason: 'done' } },
      tokenUsage: 50,
    })

    const engine = new CycleEngine({
      agentPath: dir,
      workspacePath: dir,
      projectId: 'test',
      config,
    })

    await engine.start('test catch path')

    // Read back events and verify the error was caught and logged
    const eventLog = new EventLog(dir)
    const events = await eventLog.readAll()
    const blockedEvents = events.filter(e =>
      e.type === 'advancement:blocked' && e.data.scenarioId === scenario.id
    )
    expect(blockedEvents).toHaveLength(1)
    expect(blockedEvents[0].data.reason).toContain('Cannot advance beyond implemented')

    // Verify engine did NOT crash — it continued and stopped normally
    const session = await engine.getSession()
    expect(session!.status).toBe('stopped')
  })
})
