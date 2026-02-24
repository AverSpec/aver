import { implement, unit, defineDomain, action, query, assertion } from '@aver/core'
import { reconciliation } from '../domains/reconciliation'
import { reconcile } from '../../../src/reconcile.js'
import type { TelemetryEvent, ReconciliationResult, ScenarioRef } from '../../../src/types.js'

interface ReconciliationTestSession {
  events: TelemetryEvent[]
  scenarios: ScenarioRef[]
  result: ReconciliationResult | null
}

// A test domain to reconcile against
const testDomain = defineDomain({
  name: 'TestApp',
  actions: {
    createOrder: action(),
    cancelOrder: action(),
    updateOrder: action(),
  },
  queries: {
    getOrder: query<void, unknown>(),
  },
  assertions: {
    orderExists: assertion(),
  },
})

export const reconciliationAdapter = implement(reconciliation, {
  protocol: unit<ReconciliationTestSession>(() => ({
    events: [],
    scenarios: [],
    result: null,
  })),

  actions: {
    loadProductionEvents: async (session, { events }) => {
      session.events = events as TelemetryEvent[]
    },

    loadScenarios: async (session, { scenarios }) => {
      session.scenarios = scenarios as ScenarioRef[]
    },

    runReconciliation: async (session) => {
      session.result = reconcile({
        domain: testDomain,
        scenarios: session.scenarios,
        events: session.events,
      })
    },
  },

  queries: {
    uncoveredOperations: async (session) => {
      if (!session.result) throw new Error('Reconciliation has not been run')
      return session.result.uncoveredOperations
    },

    candidateCount: async (session) => {
      if (!session.result) throw new Error('Reconciliation has not been run')
      return session.result.candidates.length
    },

    coveragePercentage: async (session) => {
      if (!session.result) throw new Error('Reconciliation has not been run')
      return session.result.coverage.percentage
    },
  },

  assertions: {
    noUncoveredOperations: async (session) => {
      if (!session.result) throw new Error('Reconciliation has not been run')
      if (session.result.uncoveredOperations.length > 0) {
        throw new Error(
          `Expected no uncovered operations but found ${session.result.uncoveredOperations.length}: ${session.result.uncoveredOperations.map(o => o.operation).join(', ')}`,
        )
      }
    },

    candidateGenerated: async (session, { operation }) => {
      if (!session.result) throw new Error('Reconciliation has not been run')
      const found = session.result.candidates.find(c =>
        c.behavior.includes(`"${operation}"`),
      )
      if (!found) {
        throw new Error(
          `Expected candidate for operation "${operation}" but none found. Candidates: ${session.result.candidates.map(c => c.behavior).join('; ')}`,
        )
      }
    },

    coverageAbove: async (session, { threshold }) => {
      if (!session.result) throw new Error('Reconciliation has not been run')
      if (session.result.coverage.percentage < threshold) {
        throw new Error(
          `Expected coverage above ${threshold}% but got ${session.result.coverage.percentage}%`,
        )
      }
    },
  },
})
