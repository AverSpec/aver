import { WorkspaceStore, WorkspaceOps, nextStage, type Scenario } from '@aver/workspace'
import { ContextCurator } from '../memory/curator.js'
import { SessionStore } from '../memory/session.js'
import { dispatchSupervisor } from '../supervisor/dispatch.js'
import type { SupervisorResult } from '../supervisor/dispatch.js'
import { dispatchWorker } from '../worker/dispatch.js'
import type { WorkerDispatchResult } from '../worker/dispatch.js'
import type {
  AgentConfig,
  AgentSession,
  SupervisorDecision,
  SupervisorInput,
  WorkerDispatch,
  WorkerResult,
  FailedWorker,
  AgentEvent,
  ArtifactContent,
} from '../types.js'

const DEFAULT_MAX_CYCLE_DEPTH = 50

export interface Dispatchers {
  supervisor: (input: SupervisorInput, config: AgentConfig) => Promise<SupervisorResult>
  worker: (dispatch: WorkerDispatch, artifacts: ArtifactContent[], config: AgentConfig, scenarioDetail?: Scenario, projectContext?: string) => Promise<WorkerDispatchResult>
}

export interface EngineOptions {
  agentPath: string
  workspacePath: string
  projectId: string
  config: AgentConfig
  dispatchers?: Dispatchers
  onMessage?: (message: string) => void
  onQuestion?: (question: string, options?: string[]) => Promise<string>
}

export class CycleEngine {
  private readonly sessionStore: SessionStore
  private readonly curator: ContextCurator
  private readonly workspaceOps: WorkspaceOps
  private readonly config: AgentConfig
  private readonly dispatchSupervisorFn: Dispatchers['supervisor']
  private readonly dispatchWorkerFn: Dispatchers['worker']
  private readonly onMessage: (message: string) => void
  private readonly onQuestion?: (question: string, options?: string[]) => Promise<string>
  private readonly maxCycleDepth: number
  private cachedCycleCount: number = 0

  constructor(options: EngineOptions) {
    this.sessionStore = new SessionStore(options.agentPath)
    this.curator = new ContextCurator({
      basePath: options.agentPath,
      rollupThreshold: options.config.cycles.rollupThreshold,
    })
    const store = WorkspaceStore.fromPath(options.workspacePath, options.projectId)
    this.workspaceOps = new WorkspaceOps(store)
    this.config = options.config
    this.dispatchSupervisorFn = options.dispatchers?.supervisor ?? dispatchSupervisor
    this.dispatchWorkerFn = options.dispatchers?.worker ?? dispatchWorker
    this.onMessage = options.onMessage ?? (() => {})
    this.onQuestion = options.onQuestion
    this.maxCycleDepth = options.config.cycles.maxCycleDepth ?? DEFAULT_MAX_CYCLE_DEPTH
  }

  async start(goal: string): Promise<void> {
    const session = await this.sessionStore.create(goal)
    this.cachedCycleCount = session.cycleCount
    await this.runCycle('startup', goal, undefined, 0)
  }

  async resume(userMessage: string): Promise<void> {
    const session = await this.sessionStore.load()
    if (session) {
      this.cachedCycleCount = session.cycleCount
    }
    await this.runCycle('user_message', userMessage, undefined, 0)
  }

  async getSession(): Promise<AgentSession | undefined> {
    return this.sessionStore.load()
  }

  async readArtifact(name: string): Promise<ArtifactContent | undefined> {
    return this.curator.readArtifact(name)
  }

  private async runCycle(
    trigger: 'startup' | 'user_message' | 'workers_complete' | 'timer',
    userMessage?: string,
    workerResults?: WorkerResult[],
    depth?: number,
    failedWorkers?: FailedWorker[],
  ): Promise<void> {
    const currentDepth = depth ?? 0

    if (currentDepth >= this.maxCycleDepth) {
      const message = `Cycle depth limit reached (${this.maxCycleDepth})`
      await this.handleError(message)
      return
    }

    const scenarios = await this.workspaceOps.getScenarios()

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
      failedWorkers,
    })

    await this.logEvent('cycle:start', { trigger })

    let decision: SupervisorDecision
    let tokenUsage: number
    try {
      const result = await this.dispatchSupervisorFn(input, this.config)
      decision = result.decision
      tokenUsage = result.tokenUsage
    } catch (err) {
      await this.handleError(
        `Supervisor dispatch failed: ${err instanceof Error ? err.message : String(err)}`,
      )
      return
    }

    await this.sessionStore.recordCycleCompletion(tokenUsage)
    this.cachedCycleCount += 1

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
        await this.sessionStore.updateStatus('stopped')
        break

      case 'ask_user':
        await this.sessionStore.updateStatus('paused')
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
        await this.curator.createCheckpoint(decision.action.summary)
        await this.logEvent('checkpoint', { summary: decision.action.summary })
        await this.runCycle('timer', undefined, undefined, depth + 1)
        break

      case 'complete_story':
        await this.curator.archiveStory(
          decision.action.scenarioId,
          decision.action.summary,
          decision.action.projectConstraints ?? [],
        )
        await this.runCycle('timer', undefined, undefined, depth + 1)
        break

      case 'update_workspace': {
        const scenarios = await this.workspaceOps.getScenarios()
        for (const update of decision.action.updates) {
          if (update.stage) {
            const scenario = scenarios.find((s) => s.id === update.scenarioId)
            if (!scenario) continue

            // Advancement always moves one stage at a time. Reject non-adjacent
            // transitions so the supervisor cannot skip stages and bypass hard blocks.
            const adjacent = nextStage(scenario.stage)
            if (adjacent === null || update.stage !== adjacent) {
              await this.logEvent('advancement:blocked', {
                scenarioId: update.scenarioId,
                from: scenario.stage,
                to: update.stage,
                reason: `Non-adjacent stage transition rejected: ${scenario.stage} -> ${update.stage} (next valid stage is ${adjacent ?? 'none — already implemented'})`,
              })
              continue
            }

            // Trust advanceScenario to enforce its own invariants (verifyAdvancement
            // is called internally). Capture warnings from the result for event logging.
            try {
              const { warnings } = await this.workspaceOps.advanceScenario(update.scenarioId, {
                rationale: update.rationale ?? '',
                promotedBy: 'aver-agent',
              })
              for (const warning of warnings) {
                await this.logEvent('advancement:warning', {
                  scenarioId: update.scenarioId,
                  from: scenario.stage,
                  to: adjacent,
                  warning,
                })
              }
            } catch (err) {
              await this.logEvent('advancement:blocked', {
                scenarioId: update.scenarioId,
                from: scenario.stage,
                to: adjacent,
                reason: err instanceof Error ? err.message : String(err),
              })
            }
          }
        }
        await this.runCycle('timer', undefined, undefined, depth + 1)
        break
      }
    }
  }

  private async runWorker(dispatch: WorkerDispatch, depth: number): Promise<void> {
    await this.logEvent('worker:dispatch', { goal: dispatch.goal, skill: dispatch.skill })

    let result: WorkerResult
    let tokenUsage: number
    try {
      const artifacts = await this.curator.loadArtifacts(dispatch.artifacts)

      // Look up scenario detail if scenarioId is provided
      let scenarioDetail: Scenario | undefined
      if (dispatch.scenarioId) {
        const scenarios = await this.workspaceOps.getScenarios()
        scenarioDetail = scenarios.find((s) => s.id === dispatch.scenarioId)
      }

      const projectContext = await this.curator.loadProjectContext()
      const response = await this.dispatchWorkerFn(dispatch, artifacts, this.config, scenarioDetail, projectContext)
      result = response.result
      tokenUsage = response.tokenUsage
    } catch (err) {
      await this.handleError(
        `Worker dispatch failed: ${err instanceof Error ? err.message : String(err)}`,
      )
      return
    }

    for (const artifact of result.artifacts) {
      await this.curator.writeArtifact(artifact)
    }

    await this.sessionStore.recordWorkerCompletion(tokenUsage)

    await this.logEvent('worker:result', { summary: result.summary, status: result.status })
    await this.runCycle('workers_complete', undefined, [result], depth + 1)
  }

  private async runWorkersParallel(dispatches: WorkerDispatch[], depth: number): Promise<void> {
    const results: WorkerResult[] = []
    const failedWorkers: FailedWorker[] = []

    // Pre-load scenarios and project context once for all workers
    const scenarios = await this.workspaceOps.getScenarios()
    const projectContext = await this.curator.loadProjectContext()

    const promises = dispatches.map(async (dispatch) => {
      await this.logEvent('worker:dispatch', { goal: dispatch.goal, skill: dispatch.skill })

      let result: WorkerResult
      let tokenUsage: number
      try {
        const artifacts = await this.curator.loadArtifacts(dispatch.artifacts)
        const scenarioDetail = dispatch.scenarioId
          ? scenarios.find((s) => s.id === dispatch.scenarioId)
          : undefined
        const response = await this.dispatchWorkerFn(dispatch, artifacts, this.config, scenarioDetail, projectContext)
        result = response.result
        tokenUsage = response.tokenUsage
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        const summary = `Worker "${dispatch.goal}" failed: ${errorMsg}`
        failedWorkers.push({ goal: dispatch.goal, error: errorMsg })
        await this.logEvent('worker:result', { summary, status: 'error' })
        return
      }

      for (const artifact of result.artifacts) {
        await this.curator.writeArtifact(artifact)
      }

      await this.sessionStore.recordWorkerCompletion(tokenUsage)

      await this.logEvent('worker:result', { summary: result.summary, status: result.status })
      results.push(result)
    })

    await Promise.all(promises)

    if (results.length === 0 && failedWorkers.length > 0) {
      await this.handleError(
        `All workers failed: ${failedWorkers.map((f) => `"${f.goal}": ${f.error}`).join('; ')}`,
      )
      return
    }

    await this.runCycle(
      'workers_complete',
      undefined,
      results,
      depth + 1,
      failedWorkers.length > 0 ? failedWorkers : undefined,
    )
  }

  private async handleError(message: string): Promise<void> {
    try {
      await this.logEvent('cycle:end', { error: message })
    } catch (err) {
      console.error(`Failed to log error event: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      await this.sessionStore.updateStatus('error', message)
    } catch (err) {
      console.error(`Failed to update session status: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private async logEvent(type: AgentEvent['type'], data: Record<string, unknown>): Promise<void> {
    await this.curator.logEvent({
      timestamp: new Date().toISOString(),
      type,
      cycleId: `cycle-${this.cachedCycleCount}`,
      data,
    })
  }
}
