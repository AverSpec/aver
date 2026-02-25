import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { implement, unit } from '@aver/core'
import { agentEval } from '../../src/domain.js'
import { CycleEngine } from '@aver/agent'
import type {
  Dispatchers,
  SupervisorResult,
  WorkerDispatchResult,
  SupervisorDecision,
  WorkerResult,
  SupervisorInput,
  WorkerDispatch,
  ArtifactContent,
  AgentConfig,
} from '@aver/agent'
import { WorkspaceStore, WorkspaceOps } from '@aver/workspace'
import type { Stage } from '@aver/workspace'
import { judge } from '../../src/judge.js'

interface QueuedSupervisorResult {
  decision: SupervisorDecision
  tokenUsage: number
}

interface QueuedWorkerResult {
  result: WorkerResult
  tokenUsage: number
}

const STAGE_ORDER: Stage[] = ['captured', 'characterized', 'mapped', 'specified', 'implemented']

interface EvalTestContext {
  dir: string
  engine: CycleEngine
  workspaceOps: WorkspaceOps
  supervisorQueue: QueuedSupervisorResult[]
  workerQueue: QueuedWorkerResult[]
  lastWorkerResult: WorkerResult | undefined
  totalTokens: number
  seededScenarioId: string | undefined
}

export const agentEvalAdapter = implement(agentEval, {
  protocol: unit<EvalTestContext>(() => {
    const dir = mkdtempSync(join(tmpdir(), 'aver-eval-test-'))
    const agentPath = join(dir, 'agent')
    const workspacePath = join(dir, 'workspace')

    const supervisorQueue: QueuedSupervisorResult[] = []
    const workerQueue: QueuedWorkerResult[] = []
    let lastWorkerResult: WorkerResult | undefined
    let totalTokens = 0

    const dispatchers: Dispatchers = {
      supervisor: async (_input: SupervisorInput, _config: AgentConfig): Promise<SupervisorResult> => {
        const next = supervisorQueue.shift()
        if (!next) {
          return {
            decision: { action: { type: 'stop', reason: 'no queued decision' } },
            tokenUsage: 0,
          }
        }
        return next
      },
      worker: async (_dispatch: WorkerDispatch, _artifacts: ArtifactContent[], _config: AgentConfig, _scenarioDetail?, _projectContext?: string): Promise<WorkerDispatchResult> => {
        const next = workerQueue.shift()
        if (!next) {
          return {
            result: { summary: 'no queued result', artifacts: [], status: 'complete' },
            tokenUsage: 0,
          }
        }
        lastWorkerResult = next.result
        totalTokens += next.tokenUsage
        return next
      },
    }

    const engine = new CycleEngine({
      agentPath,
      workspacePath,
      projectId: 'test',
      config: {
        model: { supervisor: 'mock', worker: 'mock' },
        cycles: { checkpointInterval: 10, rollupThreshold: 3, maxWorkerIterations: 15 },
        dashboard: { port: 4700 },
      },
      dispatchers,
      onMessage: () => {},
    })

    const store = new WorkspaceStore(workspacePath, 'test')
    const workspaceOps = new WorkspaceOps(store)

    return {
      dir,
      engine,
      workspaceOps,
      supervisorQueue,
      workerQueue,
      get lastWorkerResult() { return lastWorkerResult },
      set lastWorkerResult(v) { lastWorkerResult = v },
      get totalTokens() { return totalTokens },
      set totalTokens(v) { totalTokens = v },
      seededScenarioId: undefined,
    }
  }),

  actions: {
    seedScenario: async (ctx, { behavior, stage, context, rules, seams }) => {
      // Capture at the 'captured' stage
      const scenario = await ctx.workspaceOps.captureScenario({
        behavior,
        context,
        mode: 'intended',
      })
      ctx.seededScenarioId = scenario.id

      // If rules or seams are provided, mutate the scenario before advancing
      if ((rules && rules.length > 0) || (seams && seams.length > 0)) {
        const scenarios = await ctx.workspaceOps.getScenarios()
        const s = scenarios.find(sc => sc.id === scenario.id)
        if (s) {
          if (rules) s.rules = rules
          if (seams) s.seams = seams
        }
      }

      // Advance to the target stage by looping through stages
      const targetIdx = STAGE_ORDER.indexOf(stage)
      const currentIdx = STAGE_ORDER.indexOf('captured')

      for (let i = currentIdx; i < targetIdx; i++) {
        try {
          await ctx.workspaceOps.advanceScenario(scenario.id, {
            rationale: `seed to ${stage}`,
            promotedBy: 'eval-test',
          })
        } catch {
          // Some advancements may fail due to verification rules; stop advancing
          break
        }
      }
    },

    queueWorkerResult: async (ctx, { summary, artifacts }) => {
      const workerResult: WorkerResult = {
        summary,
        artifacts: (artifacts ?? []).map(a => ({
          type: a.type,
          name: a.name,
          summary: a.summary,
          content: a.content,
        })),
        status: 'complete',
        tokenUsage: 500,
      }
      ctx.workerQueue.push({
        result: workerResult,
        tokenUsage: 500,
      })
    },

    runWorker: async (ctx, { skill, goal }) => {
      // Queue a supervisor dispatch_worker decision followed by a stop
      ctx.supervisorQueue.push({
        decision: {
          action: {
            type: 'dispatch_worker',
            worker: {
              goal,
              artifacts: [],
              skill,
              allowUserQuestions: false,
              permissionLevel: 'read_only',
            },
          },
        },
        tokenUsage: 100,
      })
      ctx.supervisorQueue.push({
        decision: { action: { type: 'stop', reason: 'worker complete' } },
        tokenUsage: 0,
      })
      await ctx.engine.start(goal)
    },

    runPipeline: async (ctx, { goal }) => {
      await ctx.engine.start(goal)
    },
  },

  queries: {
    workerOutput: async (ctx) => {
      if (!ctx.lastWorkerResult) {
        throw new Error('No worker result captured')
      }
      return ctx.lastWorkerResult
    },

    scenarioAfter: async (ctx) => {
      if (!ctx.seededScenarioId) {
        throw new Error('No scenario seeded')
      }
      const scenarios = await ctx.workspaceOps.getScenarios()
      const scenario = scenarios.find(s => s.id === ctx.seededScenarioId)
      if (!scenario) {
        throw new Error(`Scenario ${ctx.seededScenarioId} not found`)
      }
      return scenario
    },

    tokenCost: async (ctx) => {
      return ctx.totalTokens
    },
  },

  assertions: {
    scenarioAdvancedTo: async (ctx, { stage }) => {
      if (!ctx.seededScenarioId) {
        throw new Error('No scenario seeded')
      }
      const scenarios = await ctx.workspaceOps.getScenarios()
      const scenario = scenarios.find(s => s.id === ctx.seededScenarioId)
      if (!scenario) {
        throw new Error(`Scenario ${ctx.seededScenarioId} not found`)
      }
      if (scenario.stage !== stage) {
        throw new Error(`Expected scenario at stage "${stage}" but got "${scenario.stage}"`)
      }
    },

    outputContainsArtifact: async (ctx, { type }) => {
      if (!ctx.lastWorkerResult) {
        throw new Error('No worker result captured')
      }
      const hasType = ctx.lastWorkerResult.artifacts.some(a => a.type === type)
      if (!hasType) {
        const found = ctx.lastWorkerResult.artifacts.map(a => a.type).join(', ')
        throw new Error(`Expected artifact of type "${type}" but found: [${found}]`)
      }
    },

    withinTokenBudget: async (ctx, { max }) => {
      if (ctx.totalTokens > max) {
        throw new Error(
          `Token usage ${ctx.totalTokens} exceeds budget of ${max}`,
        )
      }
    },

    outputMeetsRubric: async (ctx, { rubric }) => {
      if (!ctx.lastWorkerResult) {
        throw new Error('No worker result captured')
      }
      const content = ctx.lastWorkerResult.summary
      const verdict = await judge(content, rubric)
      if (!verdict.pass) {
        throw new Error(`Rubric failed: ${verdict.reasoning}`)
      }
    },
  },
})
