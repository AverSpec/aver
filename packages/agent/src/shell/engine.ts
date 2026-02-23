import { WorkspaceStore, WorkspaceOps } from '@aver/workspace'
import { ContextCurator } from '../memory/curator.js'
import { SessionStore } from '../memory/session.js'
import { dispatchSupervisor } from '../supervisor/dispatch.js'
import { dispatchWorker } from '../worker/dispatch.js'
import type {
  AgentConfig,
  AgentSession,
  SupervisorDecision,
  WorkerDispatch,
  WorkerResult,
  AgentEvent,
  ArtifactContent,
} from '../types.js'

const DEFAULT_MAX_CYCLE_DEPTH = 50

export interface EngineOptions {
  agentPath: string
  workspacePath: string
  projectId: string
  config: AgentConfig
  onMessage?: (message: string) => void
  onQuestion?: (question: string, options?: string[]) => Promise<string>
}

export class CycleEngine {
  private readonly sessionStore: SessionStore
  private readonly curator: ContextCurator
  private readonly workspaceOps: WorkspaceOps
  private readonly config: AgentConfig
  private readonly onMessage: (message: string) => void
  private readonly onQuestion?: (question: string, options?: string[]) => Promise<string>
  private readonly maxCycleDepth: number

  constructor(options: EngineOptions) {
    this.sessionStore = new SessionStore(options.agentPath)
    this.curator = new ContextCurator({
      basePath: options.agentPath,
      rollupThreshold: options.config.cycles.rollupThreshold,
    })
    const store = new WorkspaceStore(options.workspacePath, options.projectId)
    this.workspaceOps = new WorkspaceOps(store)
    this.config = options.config
    this.onMessage = options.onMessage ?? (() => {})
    this.onQuestion = options.onQuestion
    this.maxCycleDepth = options.config.cycles.maxCycleDepth ?? DEFAULT_MAX_CYCLE_DEPTH
  }

  async start(goal: string): Promise<void> {
    await this.sessionStore.create(goal)
    await this.runCycle('startup', undefined, undefined, 0)
  }

  async resume(userMessage: string): Promise<void> {
    await this.runCycle('user_message', userMessage, undefined, 0)
  }

  async getSession(): Promise<AgentSession | undefined> {
    return this.sessionStore.load()
  }

  async readArtifact(name: string): Promise<ArtifactContent | undefined> {
    return this.curator.getArtifactStore().read(name)
  }

  private async runCycle(
    trigger: 'startup' | 'user_message' | 'workers_complete' | 'timer',
    userMessage?: string,
    workerResults?: WorkerResult[],
    depth?: number,
  ): Promise<void> {
    const currentDepth = depth ?? 0

    if (currentDepth >= this.maxCycleDepth) {
      const message = `Cycle depth limit reached (${this.maxCycleDepth})`
      await this.handleError(message)
      return
    }

    const scenarios = this.workspaceOps.getScenarios()

    const input = await this.curator.buildSupervisorInput({
      trigger,
      workspace: {
        projectId: 'default',
        scenarios,
        createdAt: '',
        updatedAt: '',
      },
      userMessage,
      workerResults,
    })

    await this.logEvent('cycle:start', { trigger })

    let decision: SupervisorDecision
    let tokenUsage: number
    try {
      const result = await dispatchSupervisor(input, this.config)
      decision = result.decision
      tokenUsage = result.tokenUsage
    } catch (err) {
      await this.handleError(
        `Supervisor dispatch failed: ${err instanceof Error ? err.message : String(err)}`,
      )
      return
    }

    const session = await this.sessionStore.load()
    if (session) {
      await this.sessionStore.update({
        cycleCount: session.cycleCount + 1,
        tokenUsage: {
          supervisor: session.tokenUsage.supervisor + tokenUsage,
          worker: session.tokenUsage.worker,
        },
      })
    }

    if (decision.messageToUser) {
      this.onMessage(decision.messageToUser)
    }

    await this.logEvent('decision', { action: decision.action.type })
    await this.handleDecision(decision, currentDepth)
  }

  private async handleDecision(
    decision: SupervisorDecision,
    depth: number,
  ): Promise<void> {
    switch (decision.action.type) {
      case 'stop':
        await this.sessionStore.update({ status: 'stopped' })
        break

      case 'ask_user':
        await this.sessionStore.update({ status: 'paused' })
        if (this.onQuestion) {
          const answer = await this.onQuestion(decision.action.question, decision.action.options)
          await this.logEvent('user:answer', { answer })
          await this.runCycle('user_message', answer, undefined, depth + 1)
        }
        break

      case 'dispatch_worker':
        await this.runWorker(decision.action.worker, depth)
        break

      case 'dispatch_workers':
        await this.runWorkersParallel(decision.action.workers, depth)
        break

      case 'checkpoint':
        await this.curator.getCheckpointManager().createCheckpoint(decision.action.summary)
        await this.logEvent('checkpoint', { summary: decision.action.summary })
        await this.runCycle('timer', undefined, undefined, depth + 1)
        break

      case 'complete_story':
        await this.curator.getStoryArchiver().archiveStory(
          decision.action.scenarioId,
          decision.action.summary,
          decision.action.projectConstraints ?? [],
        )
        await this.runCycle('timer', undefined, undefined, depth + 1)
        break

      case 'update_workspace':
        for (const update of decision.action.updates) {
          if (update.stage) {
            this.workspaceOps.advanceScenario(update.scenarioId, {
              rationale: update.rationale ?? '',
              promotedBy: 'aver-agent',
            })
          }
        }
        await this.runCycle('timer', undefined, undefined, depth + 1)
        break
    }
  }

  private async runWorker(dispatch: WorkerDispatch, depth: number): Promise<void> {
    await this.logEvent('worker:dispatch', { goal: dispatch.goal, skill: dispatch.skill })

    let result: WorkerResult
    let tokenUsage: number
    try {
      const artifacts = await this.curator.loadArtifacts(dispatch.artifacts)
      const response = await dispatchWorker(dispatch, artifacts, this.config)
      result = response.result
      tokenUsage = response.tokenUsage
    } catch (err) {
      await this.handleError(
        `Worker dispatch failed: ${err instanceof Error ? err.message : String(err)}`,
      )
      return
    }

    for (const artifact of result.artifacts) {
      await this.curator.getArtifactStore().write(artifact)
    }

    const session = await this.sessionStore.load()
    if (session) {
      await this.sessionStore.update({
        workerCount: session.workerCount + 1,
        tokenUsage: {
          supervisor: session.tokenUsage.supervisor,
          worker: session.tokenUsage.worker + tokenUsage,
        },
      })
    }

    await this.logEvent('worker:result', { summary: result.summary, status: result.status })
    await this.runCycle('workers_complete', undefined, [result], depth + 1)
  }

  private async runWorkersParallel(dispatches: WorkerDispatch[], depth: number): Promise<void> {
    const results: WorkerResult[] = []
    const errors: string[] = []

    const promises = dispatches.map(async (dispatch) => {
      await this.logEvent('worker:dispatch', { goal: dispatch.goal, skill: dispatch.skill })

      let result: WorkerResult
      let tokenUsage: number
      try {
        const artifacts = await this.curator.loadArtifacts(dispatch.artifacts)
        const response = await dispatchWorker(dispatch, artifacts, this.config)
        result = response.result
        tokenUsage = response.tokenUsage
      } catch (err) {
        const msg = `Worker "${dispatch.goal}" failed: ${err instanceof Error ? err.message : String(err)}`
        errors.push(msg)
        await this.logEvent('worker:result', { summary: msg, status: 'error' })
        return
      }

      for (const artifact of result.artifacts) {
        await this.curator.getArtifactStore().write(artifact)
      }

      const session = await this.sessionStore.load()
      if (session) {
        await this.sessionStore.update({
          workerCount: session.workerCount + 1,
          tokenUsage: {
            supervisor: session.tokenUsage.supervisor,
            worker: session.tokenUsage.worker + tokenUsage,
          },
        })
      }

      await this.logEvent('worker:result', { summary: result.summary, status: result.status })
      results.push(result)
    })

    await Promise.all(promises)

    if (results.length === 0 && errors.length > 0) {
      await this.handleError(`All workers failed: ${errors.join('; ')}`)
      return
    }

    await this.runCycle('workers_complete', undefined, results, depth + 1)
  }

  private async handleError(message: string): Promise<void> {
    await this.logEvent('cycle:end', { error: message })
    await this.sessionStore.update({ status: 'error', lastError: message })
  }

  private async logEvent(type: AgentEvent['type'], data: Record<string, unknown>): Promise<void> {
    const session = await this.sessionStore.load()
    await this.curator.getEventLog().append({
      timestamp: new Date().toISOString(),
      type,
      cycleId: `cycle-${session?.cycleCount ?? 0}`,
      data,
    })
  }
}
