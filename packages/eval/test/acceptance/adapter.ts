// TODO: rewrite adapter to use AgentNetwork (Task 21)
// CycleEngine was deleted in Task 16 — this adapter is temporarily stubbed.

import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { implement, unit } from '@aver/core'
import { agentEval } from '../../src/domain.js'
import type { WorkerResult } from '@aver/agent'
import { WorkspaceStore, WorkspaceOps } from '@aver/workspace'
import type { Stage } from '@aver/workspace'
import { judge } from '../../src/judge.js'

const STAGE_ORDER: Stage[] = ['captured', 'characterized', 'mapped', 'specified', 'implemented']

interface EvalTestContext {
  dir: string
  workspaceOps: WorkspaceOps
  supervisorQueue: unknown[]
  workerQueue: unknown[]
  lastWorkerResult: WorkerResult | undefined
  totalTokens: number
  seededScenarioId: string | undefined
}

export const agentEvalAdapter = implement(agentEval, {
  protocol: unit<EvalTestContext>(() => {
    const dir = mkdtempSync(join(tmpdir(), 'aver-eval-test-'))
    const workspacePath = join(dir, 'workspace')

    const store = new WorkspaceStore(workspacePath, 'test')
    const workspaceOps = new WorkspaceOps(store)

    return {
      dir,
      workspaceOps,
      supervisorQueue: [],
      workerQueue: [],
      lastWorkerResult: undefined,
      totalTokens: 0,
      seededScenarioId: undefined,
    }
  }),

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

    runWorker: async (_ctx, { skill: _skill, goal: _goal }) => {
      // TODO: wire to AgentNetwork (Task 21)
      throw new Error('TODO: wire to AgentNetwork (Task 21)')
    },

    runPipeline: async (_ctx, { goal: _goal }) => {
      // TODO: wire to AgentNetwork (Task 21)
      throw new Error('TODO: wire to AgentNetwork (Task 21)')
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
