import { implement, unit } from '@aver/core'
import { createClient, type Client } from '@libsql/client'
import { agentEval } from '../../../src/eval/domain.js'
import type { WorkerResult } from '../../../src/types.js'
import { WorkspaceStore, initWorkspaceSchema } from '../../../src/workspace/storage.js'
import { WorkspaceOps } from '../../../src/workspace/operations.js'
import type { Stage } from '../../../src/workspace/types.js'
import { judge } from '../../../src/eval/judge.js'

const STAGE_ORDER: Stage[] = ['captured', 'characterized', 'mapped', 'specified', 'implemented']

interface QueuedWorkerResult {
  result: WorkerResult
  tokenUsage: number
}

interface EvalTestContext {
  wsClient: Client
  workspaceOps: WorkspaceOps
  workerQueue: QueuedWorkerResult[]
  lastWorkerResult: WorkerResult | undefined
  totalTokens: number
  seededScenarioId: string | undefined
}

export const agentEvalAdapter = implement(agentEval, {
  protocol: {
    name: 'unit',
    async setup(): Promise<EvalTestContext> {
      const wsClient = createClient({ url: ':memory:' })
      await initWorkspaceSchema(wsClient)
      const store = new WorkspaceStore(wsClient, 'test')
      const workspaceOps = new WorkspaceOps(store)

      return {
        wsClient,
        workspaceOps,
        workerQueue: [],
        lastWorkerResult: undefined,
        totalTokens: 0,
        seededScenarioId: undefined,
      }
    },
    async teardown(ctx: EvalTestContext) {
      ctx.wsClient.close()
    },
  },

  actions: {
    seedScenario: async (ctx, { behavior, stage, context, rules, seams }) => {
      const scenario = await ctx.workspaceOps.captureScenario({
        behavior,
        context,
        mode: 'intended',
      })
      ctx.seededScenarioId = scenario.id

      if ((rules && rules.length > 0) || (seams && seams.length > 0)) {
        const scenarios = await ctx.workspaceOps.getScenarios()
        const s = scenarios.find(sc => sc.id === scenario.id)
        if (s) {
          if (rules) s.rules = rules
          if (seams) s.seams = seams
        }
      }

      const targetIdx = STAGE_ORDER.indexOf(stage)
      const currentIdx = STAGE_ORDER.indexOf('captured')

      for (let i = currentIdx; i < targetIdx; i++) {
        try {
          await ctx.workspaceOps.advanceScenario(scenario.id, {
            rationale: `seed to ${stage}`,
            promotedBy: 'eval-test',
          })
        } catch {
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

    runWorker: async (ctx, { skill: _skill, goal: _goal }) => {
      // Pop the next queued result — simulates a worker dispatch
      const queued = ctx.workerQueue.shift()
      if (!queued) {
        throw new Error('No queued worker result — call queueWorkerResult first')
      }
      ctx.lastWorkerResult = queued.result
      ctx.totalTokens += queued.tokenUsage
    },

    runPipeline: async (_ctx, { goal: _goal }) => {
      // Full pipeline simulation not yet implemented
      throw new Error('runPipeline not implemented in eval acceptance adapter')
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
