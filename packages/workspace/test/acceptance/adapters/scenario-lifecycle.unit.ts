import { expect } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { implement, unit } from '@aver/core'
import { scenarioLifecycle } from '../domains/scenario-lifecycle'
import { WorkspaceStore, WorkspaceOps } from '../../../src/index.js'

interface ScenarioLifecycleSession {
  client: Client
  store: WorkspaceStore
  ops: WorkspaceOps
  scenarioId: string
  lastError?: Error
  initialStage?: string
}

export const scenarioLifecycleAdapter = implement(scenarioLifecycle, {
  protocol: unit<ScenarioLifecycleSession>(() => {
    const client = createClient({ url: ':memory:' })
    const store = new WorkspaceStore(client, 'test')
    const ops = new WorkspaceOps(store)
    return { client, store, ops, scenarioId: '' }
  }),

  actions: {
    captureScenario: async (session, { behavior, context, story, mode }) => {
      try {
        session.lastError = undefined
        const scenario = await session.ops.captureScenario({
          behavior,
          context,
          story,
          mode: mode as 'observed' | 'intended' | undefined,
        })
        session.scenarioId = scenario.id
        session.initialStage = scenario.stage
      } catch (e: any) {
        session.lastError = e
      }
    },

    updateScenario: async (session, { behavior, rules, context, story, examples, constraints, seams }) => {
      try {
        session.lastError = undefined
        const before = await session.ops.getScenario(session.scenarioId)
        if (before) session.initialStage = before.stage
        await session.ops.updateScenario(session.scenarioId, {
          behavior, rules, context, story, examples, constraints, seams,
        })
      } catch (e: any) {
        session.lastError = e
      }
    },

    revisitScenario: async (session, { targetStage, rationale }) => {
      try {
        session.lastError = undefined
        await session.ops.revisitScenario(session.scenarioId, {
          targetStage: targetStage as any,
          rationale,
        })
      } catch (e: any) {
        session.lastError = e
      }
    },

    advanceScenario: async (session, { rationale, promotedBy }) => {
      try {
        session.lastError = undefined
        await session.ops.advanceScenario(session.scenarioId, { rationale, promotedBy })
      } catch (e: any) {
        session.lastError = e
      }
    },

    confirmScenario: async (session, { confirmer }) => {
      try {
        session.lastError = undefined
        await session.ops.confirmScenario(session.scenarioId, confirmer)
      } catch (e: any) {
        session.lastError = e
      }
    },

    linkToDomain: async (session, { domainOperation, testNames }) => {
      try {
        session.lastError = undefined
        await session.ops.linkToDomain(session.scenarioId, { domainOperation, testNames })
      } catch (e: any) {
        session.lastError = e
      }
    },

    deleteScenario: async (session) => {
      try {
        session.lastError = undefined
        await session.ops.deleteScenario(session.scenarioId)
      } catch (e: any) {
        session.lastError = e
      }
    },
  },

  queries: {
    scenarioStage: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      return s ? s.stage : 'unknown'
    },

    scenarioMode: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      return s?.mode ?? 'unknown'
    },

    scenarioBehavior: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      return s?.behavior ?? ''
    },

    scenarioRuleCount: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      return s?.rules.length ?? 0
    },

    scenarioConfirmation: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      return s?.confirmedBy ?? null
    },

    domainOperation: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      return s?.domainOperation
    },

    scenarioContext: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      return s?.context ?? ''
    },

    scenarioStory: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      return s?.story ?? ''
    },

    examplesCount: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      return s?.examples.length ?? 0
    },

    constraintsCount: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      return s?.constraints.length ?? 0
    },

    seamsCount: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      return s?.seams.length ?? 0
    },

    exampleGiven: async (session, { index }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      return s?.examples[index]?.given
    },
  },

  assertions: {
    scenarioCreated: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      expect(s!.stage).toBe('captured')
      expect(s!.id).toBeTruthy()
      expect(s!.rules.length).toBe(0)
      expect(s!.examples.length).toBe(0)
      expect(s!.questions.length).toBe(0)
    },

    modeIs: async (session, { mode }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      expect(s!.mode).toBe(mode)
    },

    behaviorIs: async (session, { behavior }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      expect(s!.behavior).toBe(behavior)
    },

    stageIs: async (session, { stage }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      expect(s!.stage).toBe(stage)
    },

    stageUnchanged: async (session, { stage }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      expect(s!.stage).toBe(stage)
    },

    rulesReplaced: async (session, { count }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      expect(s!.rules.length).toBe(count)
    },

    confirmationCleared: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      expect(s!.confirmedBy).toBeFalsy()
    },

    confirmationPresent: async (session, { confirmer }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      expect(s!.confirmedBy).toBe(confirmer)
    },

    linksCleared: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      expect(s!.domainOperation).toBeFalsy()
      expect(s!.testNames?.length ?? 0).toBe(0)
      expect(s!.approvalBaseline).toBeFalsy()
    },

    scenarioDoesNotExist: async (session) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeUndefined()
    },

    transitionRecorded: async (session, { from, to }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      const match = s!.transitions.find((t) => t.from === from && t.to === to)
      expect(match).toBeDefined()
    },

    contextIs: async (session, { expected }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      expect(s!.context).toBe(expected)
    },

    storyIs: async (session, { expected }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      expect(s!.story).toBe(expected)
    },

    examplesReplaced: async (session, { count }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      expect(s!.examples.length).toBe(count)
    },

    constraintsReplaced: async (session, { count }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      expect(s!.constraints.length).toBe(count)
    },

    seamsReplaced: async (session, { count }) => {
      const s = await session.ops.getScenario(session.scenarioId)
      expect(s).toBeDefined()
      expect(s!.seams.length).toBe(count)
    },

    operationFailed: async (session, { message }) => {
      expect(session.lastError).toBeDefined()
      expect(session.lastError!.message).toContain(message)
    },
  },
})
