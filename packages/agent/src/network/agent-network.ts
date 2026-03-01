import type { Client } from '@libsql/client'
import { AgentStore, type Agent } from '../db/agent-store.js'
import { SessionStore, type Session } from '../db/session-store.js'
import { EventStore } from '../db/event-store.js'
import { ObservationStore } from '../db/observation-store.js'
import { ContextAssembler } from '../context/assembler.js'
import { Observer, type DispatchFn as ObserverDispatchFn } from '../observe/observer.js'
import { Reflector } from '../observe/reflector.js'
import { estimateTokens } from '../db/tokens.js'
import { TriggerQueue, type Trigger } from './triggers.js'
import { parseDecision, DecisionParseError } from '../supervisor/decisions.js'
import { buildSupervisorPrompt, type ActiveWorkerInfo } from '../supervisor/prompt.js'
import { buildWorkerPrompts } from '../worker/prompt.js'
import { STAGE_ORDER, type WorkspaceOps } from '../workspace/operations.js'
import type { Stage } from '../workspace/types.js'
import type { PermissionLevel } from '../shell/hooks.js'
import type { StreamEvent, RawStreamBlock } from './stream-events.js'

// --- Decision types (new, simplified) ---

export type SupervisorDecision =
  | { action: 'create_worker'; goal: string; skill: string; permission?: 'read_only' | 'edit' | 'full'; scenarioId?: string; model?: string }
  | { action: 'assign_goal'; agentId: string; goal: string }
  | { action: 'terminate_worker'; agentId: string }
  | { action: 'advance_scenario'; scenarioId: string; rationale?: string }
  | { action: 'ask_human'; question: string }
  | { action: 'discuss'; message: string; scenarioId?: string }
  | { action: 'update_scenario'; scenarioId: string; updates: Record<string, unknown> }
  | { action: 'revisit_scenario'; scenarioId: string; targetStage: string; rationale: string }
  | { action: 'stop'; reason?: string }

// --- Dispatchers ---

export interface DispatchResult {
  response: string
  tokenUsage: number
}

export interface Dispatchers {
  supervisorDispatch: (systemPrompt: string, userPrompt: string) => Promise<DispatchResult>
  workerDispatch: (systemPrompt: string, userPrompt: string, permission: PermissionLevel, onStreamBlock?: (block: RawStreamBlock) => void) => Promise<DispatchResult>
  observerDispatch?: (systemPrompt: string, userPrompt: string) => Promise<string>
}

// --- Config ---

export interface AgentNetworkConfig {
  maxCycleDepth?: number
  observationThreshold?: number
  reflectionThreshold?: number
  supervisorModel?: string
  workerModel?: string
  claudeExecutablePath?: string
  projectContext?: string
}

export interface AgentNetworkCallbacks {
  onMessage?: (msg: string) => void
  onQuestion?: (question: string) => Promise<string>
  onStreamEvent?: (event: StreamEvent) => void
  onSupervisorThinking?: (thinking: boolean) => void
}

// --- Constants ---

const DEFAULT_MAX_CYCLE_DEPTH = 50
const DEFAULT_OBSERVATION_THRESHOLD = 30_000
const DEFAULT_REFLECTION_THRESHOLD = 40_000

// --- AgentNetwork ---

export class AgentNetwork {
  private readonly agentStore: AgentStore
  private readonly sessionStore: SessionStore
  private readonly eventStore: EventStore
  private readonly observationStore: ObservationStore
  private readonly contextAssembler: ContextAssembler
  private readonly triggerQueue: TriggerQueue
  private readonly maxCycleDepth: number
  private readonly observer: Observer | undefined
  private readonly reflector: Reflector | undefined

  private session: Session | undefined
  private supervisorAgent: Agent | undefined
  private sessionWorkerIds = new Set<string>()
  private cycleDepth = 0
  private stopped = false

  constructor(
    private readonly db: Client,
    private readonly dispatchers: Dispatchers,
    private readonly workspaceOps: WorkspaceOps,
    private readonly config: AgentNetworkConfig,
    private readonly callbacks: AgentNetworkCallbacks = {},
  ) {
    this.agentStore = new AgentStore(db)
    this.sessionStore = new SessionStore(db)
    this.eventStore = new EventStore(db)
    this.observationStore = new ObservationStore(db)
    this.contextAssembler = new ContextAssembler(this.observationStore, {
      supervisorObservationBudget: config.observationThreshold ?? DEFAULT_OBSERVATION_THRESHOLD,
      workerObservationBudget: config.reflectionThreshold ?? DEFAULT_REFLECTION_THRESHOLD,
    })
    this.triggerQueue = new TriggerQueue()
    this.maxCycleDepth = config.maxCycleDepth ?? DEFAULT_MAX_CYCLE_DEPTH

    // Wire Observer + Reflector when observerDispatch is provided
    if (dispatchers.observerDispatch) {
      this.observer = new Observer(this.observationStore, dispatchers.observerDispatch)
      this.reflector = new Reflector(
        this.observationStore,
        dispatchers.observerDispatch,
        { threshold: config.reflectionThreshold ?? DEFAULT_REFLECTION_THRESHOLD },
      )
    }
  }

  async start(goal?: string): Promise<void> {
    // 1. Create session
    this.session = await this.sessionStore.createSession({ goal: goal ?? '' })

    // 2. Create supervisor agent
    this.supervisorAgent = await this.agentStore.createAgent({
      role: 'supervisor',
      goal: goal ?? '',
      model: this.config.supervisorModel,
    })

    // 3. Wire trigger queue
    this.triggerQueue.onTrigger((triggers) => {
      // Fire-and-forget — the queue handles active/idle gating
      void this.wakeSupervisor(triggers)
    })

    // 4. Log session start
    await this.logEvent('session:start', { goal: goal ?? '(open session)', sessionId: this.session.id })

    // 5. Push session:start trigger (fires wakeSupervisor)
    this.triggerQueue.push({
      type: 'session:start',
      data: { goal: goal ?? '' },
      timestamp: new Date().toISOString(),
    })
  }

  async stop(): Promise<void> {
    this.stopped = true

    // Terminate all active workers
    const workers = await this.agentStore.getActiveWorkers()
    for (const worker of workers) {
      await this.agentStore.terminateAgent(worker.id)
    }

    // Terminate supervisor
    if (this.supervisorAgent) {
      await this.agentStore.terminateAgent(this.supervisorAgent.id)
    }

    // Update session
    if (this.session) {
      await this.sessionStore.updateSession(this.session.id, { status: 'complete' })
    }

    await this.logEvent('session:stop', { reason: 'manual' })
  }

  async handleHumanMessage(message: string): Promise<void> {
    // Persist as a project-scoped critical observation so it survives compression
    await this.observationStore.addObservation({
      agentId: this.supervisorAgent?.id ?? 'human',
      scope: 'project',
      priority: 'critical',
      content: `Human message: ${message}`,
      tokenCount: estimateTokens(`Human message: ${message}`),
    })

    this.triggerQueue.push({
      type: 'human:message',
      data: { message },
      timestamp: new Date().toISOString(),
    })
  }

  // --- Internal: supervisor wake loop ---

  private async wakeSupervisor(triggers: Trigger[]): Promise<void> {
    if (this.stopped) return

    this.triggerQueue.markActive()
    this.cycleDepth++

    if (this.cycleDepth > this.maxCycleDepth) {
      this.stopped = true
      await this.handleError(`Cycle depth limit reached (${this.maxCycleDepth})`)
      this.triggerQueue.markIdle()
      return
    }

    try {
      // Build context
      const supervisorId = this.supervisorAgent?.id ?? 'supervisor'
      const context = await this.contextAssembler.assembleForSupervisor(supervisorId)

      // Gather workspace state
      const scenarios = await this.workspaceOps.getScenarios() as import('../workspace/types.js').Scenario[]
      const allWorkers = await this.agentStore.getActiveWorkers()
      const activeWorkers = allWorkers.filter((w) => this.sessionWorkerIds.has(w.id))

      // Extract human messages from triggers into the dedicated field
      const humanMessages = triggers
        .filter((t) => t.type === 'human:message' && t.data?.message)
        .map((t) => t.data!.message as string)
      const humanMessage = humanMessages.length > 0 ? humanMessages.join('\n\n') : undefined

      // Build prompts using the rich builder
      const workerInfos: ActiveWorkerInfo[] = activeWorkers.map((w) => ({
        id: w.id,
        goal: w.goal,
        skill: w.skill,
        status: w.status,
        scenarioId: w.scenarioId,
      }))

      const { system: systemPrompt, user: userPrompt } = buildSupervisorPrompt({
        projectContext: this.config.projectContext ?? '',
        observations: context.observationBlock,
        scenarios,
        activeWorkers: workerInfos,
        triggers,
        humanMessage,
      })

      // Dispatch
      this.callbacks.onSupervisorThinking?.(true)
      const { response, tokenUsage } = await this.dispatchers.supervisorDispatch(
        systemPrompt,
        userPrompt,
      )
      this.callbacks.onSupervisorThinking?.(false)

      // Update token usage
      if (this.session) {
        const currentSession = await this.sessionStore.getSession(this.session.id)
        if (currentSession) {
          const usage = { ...currentSession.tokenUsage }
          usage.supervisor += tokenUsage
          await this.sessionStore.updateSession(this.session.id, { tokenUsage: usage })
        }
      }

      // Parse decision — malformed decisions are logged and skipped
      let decision: SupervisorDecision
      try {
        decision = parseDecision(response)
      } catch (parseErr) {
        if (parseErr instanceof DecisionParseError) {
          await this.logEvent('decision:invalid', {
            error: parseErr.message,
            details: parseErr.details,
            rawResponse: response.slice(0, 500),
          })
          // Skip this decision — don't kill the session
          return
        }
        throw parseErr
      }

      await this.logEvent('supervisor:decision', {
        action: decision.action,
        triggers: triggers.map((t) => t.type),
      })

      // Handle decision
      await this.handleDecision(decision)
    } catch (err) {
      await this.handleError(
        `Supervisor wake failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      this.triggerQueue.markIdle()
      // If markIdle() delivered queued triggers, the new wakeSupervisor() call
      // runs synchronously up to its first await, setting isActive = true.
      // If no triggers were pending, isActive stays false — the burst is over.
      if (!this.triggerQueue.isActive) {
        this.cycleDepth = 0
      }
    }
  }

  // --- Decision handling ---

  private async handleDecision(decision: SupervisorDecision): Promise<void> {
    switch (decision.action) {
      case 'create_worker':
        await this.handleCreateWorker(decision)
        break
      case 'assign_goal':
        await this.handleAssignGoal(decision)
        break
      case 'terminate_worker':
        await this.handleTerminateWorker(decision)
        break
      case 'advance_scenario':
        await this.handleAdvanceScenario(decision)
        break
      case 'ask_human':
        await this.handleAskHuman(decision)
        break
      case 'discuss':
        await this.handleDiscuss(decision)
        break
      case 'update_scenario':
        await this.handleUpdateScenario(decision)
        break
      case 'revisit_scenario':
        await this.handleRevisitScenario(decision)
        break
      case 'stop':
        await this.handleStop(decision)
        break
    }
  }

  private async handleCreateWorker(
    decision: Extract<SupervisorDecision, { action: 'create_worker' }>,
  ): Promise<void> {
    const worker = await this.agentStore.createAgent({
      role: 'worker',
      goal: decision.goal,
      skill: decision.skill,
      permission: decision.permission ?? 'read_only',
      scenarioId: decision.scenarioId,
      model: decision.model ?? this.config.workerModel,
    })
    this.sessionWorkerIds.add(worker.id)

    await this.logEvent('worker:created', {
      agentId: worker.id,
      goal: decision.goal,
      skill: decision.skill,
    })

    // Run worker (simple single dispatch for MVP)
    await this.runWorker(worker)
  }

  private async handleAssignGoal(
    decision: Extract<SupervisorDecision, { action: 'assign_goal' }>,
  ): Promise<void> {
    await this.agentStore.updateAgent(decision.agentId, { goal: decision.goal })
    await this.logEvent('worker:goal_assigned', {
      agentId: decision.agentId,
      goal: decision.goal,
    })
  }

  private async handleTerminateWorker(
    decision: Extract<SupervisorDecision, { action: 'terminate_worker' }>,
  ): Promise<void> {
    await this.agentStore.terminateAgent(decision.agentId)
    await this.logEvent('worker:terminated', { agentId: decision.agentId })

    // Push trigger so supervisor knows
    this.triggerQueue.push({
      type: 'worker:terminated',
      agentId: decision.agentId,
      timestamp: new Date().toISOString(),
    })
  }

  private async handleAdvanceScenario(
    decision: Extract<SupervisorDecision, { action: 'advance_scenario' }>,
  ): Promise<void> {
    try {
      const result = await this.workspaceOps.advanceScenario(decision.scenarioId, {
        rationale: decision.rationale ?? '',
        promotedBy: 'aver-agent',
      })

      for (const warning of result.warnings) {
        await this.logEvent('advancement:warning', {
          scenarioId: decision.scenarioId,
          warning,
        })
      }

      await this.logEvent('scenario:advanced', {
        scenarioId: decision.scenarioId,
        stage: result.scenario.stage,
      })
    } catch (err) {
      await this.logEvent('advancement:blocked', {
        scenarioId: decision.scenarioId,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private async handleAskHuman(
    decision: Extract<SupervisorDecision, { action: 'ask_human' }>,
  ): Promise<void> {
    await this.logEvent('supervisor:message', { message: decision.question, type: 'ask_human' })

    if (this.callbacks.onMessage) {
      this.callbacks.onMessage(decision.question)
    }

    if (this.callbacks.onQuestion) {
      const answer = await this.callbacks.onQuestion(decision.question)
      await this.logEvent('human:answer', { answer })

      // Push human:message trigger with the response
      this.triggerQueue.push({
        type: 'human:message',
        data: { message: answer },
        timestamp: new Date().toISOString(),
      })
    } else {
      // No onQuestion handler — pause the session so it can be resumed later
      // via handleHumanMessage. Without this, the session hangs indefinitely.
      await this.logEvent('session:paused', {
        reason: 'ask_human requires onQuestion callback; pausing until human message arrives',
        question: decision.question,
      })
      if (this.session) {
        try {
          await this.sessionStore.updateSession(this.session.id, { status: 'paused' })
        } catch (err) {
          console.error('[aver] failed to pause session:', err)
        }
      }
    }
  }

  private async handleDiscuss(
    decision: Extract<SupervisorDecision, { action: 'discuss' }>,
  ): Promise<void> {
    await this.logEvent('supervisor:message', { message: decision.message, type: 'discuss' })

    // Always deliver the message
    if (this.callbacks.onMessage) {
      this.callbacks.onMessage(decision.message)
    }

    if (this.callbacks.onQuestion) {
      const answer = await this.callbacks.onQuestion(decision.message)
      await this.logEvent('human:answer', { answer })

      // Store the exchange as an observation
      const scope = decision.scenarioId ? `scenario:${decision.scenarioId}` : 'strategy'
      const exchange = `Discussion:\nQ: ${decision.message}\nA: ${answer}`
      await this.observationStore.addObservation({
        agentId: this.supervisorAgent?.id ?? 'supervisor',
        scope,
        priority: 'important',
        content: exchange.slice(0, 2000),
        tokenCount: Math.ceil(exchange.length / 4),
      })

      // Push human:message trigger to re-wake supervisor
      this.triggerQueue.push({
        type: 'human:message',
        data: { message: answer },
        timestamp: new Date().toISOString(),
      })
    }
  }

  private async handleUpdateScenario(
    decision: Extract<SupervisorDecision, { action: 'update_scenario' }>,
  ): Promise<void> {
    try {
      await this.workspaceOps.updateScenario(decision.scenarioId, decision.updates)
      await this.logEvent('scenario:updated', {
        scenarioId: decision.scenarioId,
        fields: Object.keys(decision.updates),
      })
    } catch (err) {
      await this.logEvent('scenario:update_failed', {
        scenarioId: decision.scenarioId,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private async handleRevisitScenario(
    decision: Extract<SupervisorDecision, { action: 'revisit_scenario' }>,
  ): Promise<void> {
    try {
      if (!STAGE_ORDER.includes(decision.targetStage as any)) {
        throw new Error(`Invalid targetStage "${decision.targetStage}" — must be one of: ${STAGE_ORDER.join(', ')}`)
      }

      const scenario = await this.workspaceOps.getScenario(decision.scenarioId)
      const fromStage = scenario?.stage ?? 'unknown'

      const { clearedFields } = await this.workspaceOps.revisitScenario(decision.scenarioId, {
        targetStage: decision.targetStage as Stage,
        rationale: decision.rationale,
      })

      await this.logEvent('scenario:revisited', {
        scenarioId: decision.scenarioId,
        fromStage,
        toStage: decision.targetStage,
        rationale: decision.rationale,
        clearedFields,
      })
    } catch (err) {
      await this.logEvent('revisit:blocked', {
        scenarioId: decision.scenarioId,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private async handleStop(
    decision: Extract<SupervisorDecision, { action: 'stop' }>,
  ): Promise<void> {
    this.stopped = true

    // Terminate all active workers
    const workers = await this.agentStore.getActiveWorkers()
    for (const worker of workers) {
      await this.agentStore.terminateAgent(worker.id)
    }

    // Update session
    if (this.session) {
      await this.sessionStore.updateSession(this.session.id, { status: 'complete' })
    }

    await this.logEvent('session:stop', { reason: decision.reason ?? 'supervisor decided to stop' })
  }

  // --- Worker execution ---

  private async runWorker(worker: Agent): Promise<void> {
    await this.agentStore.updateAgent(worker.id, { status: 'active' })

    try {
      // Build context
      const scenarioId = worker.scenarioId ?? 'default'
      const context = await this.contextAssembler.assembleForWorker(worker.id, scenarioId)

      // Use rich worker prompt builder
      const { systemPrompt, userPrompt } = buildWorkerPrompts({
        goal: worker.goal,
        observationBlock: context.observationBlock,
        permissionLevel: worker.permission ?? 'read_only',
        skill: worker.skill ?? 'general',
      })

      // Bridge streaming: wrap raw blocks with worker.id to produce StreamEvents
      const onStreamBlock = this.callbacks.onStreamEvent
        ? (block: RawStreamBlock) => {
            let event: StreamEvent
            switch (block.type) {
              case 'text':
                event = { type: 'worker:text', workerId: worker.id, text: block.text }
                break
              case 'tool_use':
                event = { type: 'worker:tool_use', workerId: worker.id, tool: block.tool, input: block.input }
                break
              case 'tool_result':
                event = { type: 'worker:tool_result', workerId: worker.id, tool: block.tool, output: block.output }
                break
            }
            this.callbacks.onStreamEvent!(event)
          }
        : undefined

      const { response, tokenUsage } = await this.dispatchers.workerDispatch(
        systemPrompt,
        userPrompt,
        (worker.permission as PermissionLevel) ?? 'read_only',
        onStreamBlock,
      )

      // Update token usage
      if (this.session) {
        const currentSession = await this.sessionStore.getSession(this.session.id)
        if (currentSession) {
          const usage = { ...currentSession.tokenUsage }
          usage.worker += tokenUsage
          await this.sessionStore.updateSession(this.session.id, { tokenUsage: usage })
        }
      }

      // Store worker output as observations
      const scope = worker.scenarioId ? `scenario:${worker.scenarioId}` : `agent:${worker.id}`
      if (this.observer) {
        // Use Observer for structured observation extraction
        await this.observer.observe(worker.id, scope, [
          { role: 'assistant', content: response },
        ])
        // Check if Reflector should compress
        if (this.reflector) {
          await this.reflector.reflect(scope)
        }
      } else {
        // Fallback: store as a single observation (preserves existing test behavior)
        await this.observationStore.addObservation({
          agentId: worker.id,
          scope,
          priority: 'important',
          content: response.slice(0, 2000),
          tokenCount: estimateTokens(response.slice(0, 2000)),
        })
      }

      await this.agentStore.updateAgent(worker.id, { status: 'idle' })

      await this.logEvent('worker:complete', {
        agentId: worker.id,
        responseLength: response.length,
        tokenUsage,
      })

      // Push trigger to wake supervisor
      this.triggerQueue.push({
        type: 'worker:goal_complete',
        agentId: worker.id,
        data: { summary: response.slice(0, 500) },
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      await this.agentStore.updateAgent(worker.id, { status: 'idle' })
      await this.logEvent('worker:error', {
        agentId: worker.id,
        error: err instanceof Error ? err.message : String(err),
      })

      // Push stuck trigger
      this.triggerQueue.push({
        type: 'worker:stuck',
        agentId: worker.id,
        data: { error: err instanceof Error ? err.message : String(err) },
        timestamp: new Date().toISOString(),
      })
    }
  }

  // --- Utilities ---

  private async logEvent(type: string, data: Record<string, unknown>): Promise<void> {
    try {
      await this.eventStore.logEvent({
        agentId: this.supervisorAgent?.id,
        type,
        data,
      })
    } catch (err) {
      // Swallow logging errors to avoid cascading failures
      console.error(`Failed to log event: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private async handleError(message: string): Promise<void> {
    this.stopped = true
    await this.logEvent('error', { message })
    if (this.session) {
      try {
        await this.sessionStore.updateSession(this.session.id, { status: 'error' })
      } catch (err) {
        console.error('[aver] failed to update session status:', err)
      }
    }
  }

  // --- Accessors for testing ---

  get currentSession(): Session | undefined {
    return this.session
  }

  get supervisor(): Agent | undefined {
    return this.supervisorAgent
  }

  get isStopped(): boolean {
    return this.stopped
  }
}
