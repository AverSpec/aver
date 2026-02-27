import { implement, unit } from '@aver/core'
import { AverTui } from '../../src/tui-domain.js'
import { tuiReducer, initialState } from '../../src/tui/state.js'
import type { TuiState, PendingQuestion } from '../../src/tui/state.js'
import type { Scenario } from '../../src/workspace/types.js'

interface TuiTestContext {
  state: TuiState
  resolvers: Map<string, (answer: string) => void>
}

function makeScenario(partial: { id: string; stage: string; behavior: string }): Scenario {
  return {
    id: partial.id,
    stage: partial.stage as Scenario['stage'],
    behavior: partial.behavior,
    rules: [],
    examples: [],
    questions: [],
    constraints: [],
    seams: [],
    transitions: [],
    createdAt: '',
    updatedAt: '',
  }
}

export const averTuiAdapter = implement(AverTui, {
  protocol: unit<TuiTestContext>(() => ({
    state: { ...initialState },
    resolvers: new Map(),
  })),

  actions: {
    dispatchEvent: async (ctx, { event }) => {
      ctx.state = tuiReducer(ctx.state, { type: 'event', event })
    },

    updateScenarios: async (ctx, { scenarios }) => {
      ctx.state = tuiReducer(ctx.state, {
        type: 'scenarios_updated',
        scenarios: scenarios.map(makeScenario),
      })
    },

    receiveQuestion: async (ctx, { id, question, options }) => {
      const pendingQuestion: PendingQuestion = {
        id,
        question,
        options,
        resolve: (answer: string) => {
          ctx.resolvers.set(id, () => {})
        },
      }
      ctx.state = tuiReducer(ctx.state, { type: 'question_received', question: pendingQuestion })
    },

    answerQuestion: async (ctx, { questionId }) => {
      const pending = ctx.state.pendingQuestion
      if (pending && pending.id === questionId) {
        pending.resolve('answered')
      }
      ctx.state = tuiReducer(ctx.state, { type: 'question_answered', questionId })
    },

    changePhase: async (ctx, { phase }) => {
      ctx.state = tuiReducer(ctx.state, { type: 'phase_changed', phase })
    },
  },

  queries: {
    phase: async (ctx) => ctx.state.phase,

    workerCount: async (ctx) => ctx.state.workers.length,

    workersWithStatus: async (ctx, { status }) =>
      ctx.state.workers.filter((w) => w.status === status),

    eventCount: async (ctx) => ctx.state.events.length,

    scenarioCount: async (ctx) => ctx.state.scenarios.length,

    implementedCount: async (ctx) =>
      ctx.state.scenarios.filter((s) => s.stage === 'implemented').length,

    pendingQuestion: async (ctx) => {
      const q = ctx.state.pendingQuestion
      if (!q) return undefined
      return { id: q.id, question: q.question, options: q.options }
    },

    questionQueueLength: async (ctx) => ctx.state.questionQueue.length,
  },

  assertions: {
    phaseIs: async (ctx, { phase }) => {
      if (ctx.state.phase !== phase) {
        throw new Error(`Expected phase "${phase}" but got "${ctx.state.phase}"`)
      }
    },

    hasWorkerWithGoal: async (ctx, { goal }) => {
      const found = ctx.state.workers.find((w) => w.goal === goal)
      if (!found) {
        const goals = ctx.state.workers.map((w) => w.goal)
        throw new Error(`No worker with goal "${goal}". Workers: [${goals.join(', ')}]`)
      }
    },

    workerStatusIs: async (ctx, { goal, status }) => {
      const worker = ctx.state.workers.find((w) => w.goal === goal)
      if (!worker) {
        throw new Error(`No worker with goal "${goal}"`)
      }
      if (worker.status !== status) {
        throw new Error(
          `Expected worker "${goal}" status "${status}" but got "${worker.status}"`,
        )
      }
    },

    hasNoPendingQuestion: async (ctx) => {
      if (ctx.state.pendingQuestion) {
        throw new Error(
          `Expected no pending question but found "${ctx.state.pendingQuestion.question}"`,
        )
      }
    },

    questionTextIs: async (ctx, { text }) => {
      if (!ctx.state.pendingQuestion) {
        throw new Error(`No pending question`)
      }
      if (ctx.state.pendingQuestion.question !== text) {
        throw new Error(
          `Expected question "${text}" but got "${ctx.state.pendingQuestion.question}"`,
        )
      }
    },

    scenarioCountIs: async (ctx, { count }) => {
      const actual = ctx.state.scenarios.length
      if (actual !== count) {
        throw new Error(`Expected ${count} scenarios but got ${actual}`)
      }
    },
  },
})
