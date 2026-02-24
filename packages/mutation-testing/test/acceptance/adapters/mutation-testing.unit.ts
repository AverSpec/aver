import { implement, defineDomain, action, query, assertion } from '@aver/core'
import type { Protocol } from '@aver/core'
import { mutationTesting } from '../domains/mutation-testing'
import { runMutationEngine } from '../../../src/engine'
import { defaultOperators } from '../../../src/operators/index'
import { generateAdapterMutants, runMutant } from '../../../src/adapter-mutator'
import type { MutationReport, SurvivedMutant, AdapterOperator } from '../../../src/engine-types'

const unitProtocol: Protocol<MutationTestingContext> = {
  name: 'unit',
  async setup() { return new MutationTestingContext() },
  async teardown() {},
}

class MutationTestingContext {
  report: MutationReport | null = null
  operators: AdapterOperator[] = [...defaultOperators()]
}

export const mutationTestingAdapter = implement(mutationTesting, {
  protocol: unitProtocol,
  actions: {
    runAdapterMutations: async (ctx, payload) => {
      // Use a trivial domain+adapter for self-testing
      const trivialDomain = defineDomain({
        name: 'Trivial',
        actions: { doIt: action<void>() },
        queries: { getIt: query<void, string>() },
        assertions: { checkIt: assertion<void>() },
      })
      const trivialProtocol: Protocol<void> = {
        name: 'unit',
        async setup() {},
        async teardown() {},
      }
      const trivialAdapter = implement(trivialDomain, {
        protocol: trivialProtocol,
        actions: { doIt: async () => {} },
        queries: { getIt: async () => 'value' },
        assertions: { checkIt: async () => {} },
      })

      const result = await runMutationEngine({
        domain: trivialDomain,
        operators: ctx.operators,
        adapters: [{ name: payload?.adapterName ?? 'trivial', adapter: trivialAdapter }],
        testRunner: async (adapter) => {
          // Simple test: call each handler and check for errors
          try {
            const pCtx = await adapter.protocol.setup()
            await (adapter.handlers.actions as any).doIt(pCtx)
            const val = await (adapter.handlers.queries as any).getIt(pCtx)
            await (adapter.handlers.assertions as any).checkIt(pCtx)
            await adapter.protocol.teardown(pCtx)
            // If query returned wrong value, fail
            if (val !== 'value') return { passed: false, failedTests: ['getIt returned wrong value'] }
            return { passed: true, failedTests: [] }
          } catch (e) {
            return { passed: false, failedTests: [(e as Error).message] }
          }
        },
      })

      ctx.report = result.report
    },
    registerOperator: async (ctx, payload) => {
      ctx.operators.push({
        name: payload.name,
        targets: payload.targets as AdapterOperator['targets'],
        mutate: () => async () => undefined,
      })
    },
  },
  queries: {
    mutationScore: async (ctx) => {
      if (!ctx.report) return 0
      const scores = Object.values(ctx.report.adapters)
      if (scores.length === 0) return 0
      return scores[0].score
    },
    survivorCount: async (ctx) => {
      if (!ctx.report) return 0
      return Object.values(ctx.report.adapters).reduce((sum, sc) => sum + sc.survived, 0)
    },
    survivors: async (ctx) => {
      if (!ctx.report) return []
      return Object.values(ctx.report.adapters).flatMap(sc => sc.survivors)
    },
    report: async (ctx) => {
      if (!ctx.report) throw new Error('No report available — run mutations first')
      return ctx.report
    },
  },
  assertions: {
    allMutantsKilled: async (ctx) => {
      if (!ctx.report) throw new Error('No report — run mutations first')
      const survived = Object.values(ctx.report.adapters).reduce((s, sc) => s + sc.survived, 0)
      if (survived > 0) throw new Error(`${survived} mutant(s) survived`)
    },
    scoreAbove: async (ctx, payload) => {
      if (!ctx.report) throw new Error('No report — run mutations first')
      const scores = Object.values(ctx.report.adapters)
      for (const sc of scores) {
        if (sc.score < payload.threshold) {
          throw new Error(`Mutation score ${(sc.score * 100).toFixed(1)}% is below threshold ${(payload.threshold * 100).toFixed(1)}%`)
        }
      }
    },
    noSurvivorsIn: async (ctx, payload) => {
      if (!ctx.report) throw new Error('No report — run mutations first')
      const survivors = Object.values(ctx.report.adapters)
        .flatMap(sc => sc.survivors)
        .filter(s => s.handlerName === payload.handlerName)
      if (survivors.length > 0) {
        throw new Error(`${survivors.length} survivor(s) in handler ${payload.handlerName}`)
      }
    },
  },
})
