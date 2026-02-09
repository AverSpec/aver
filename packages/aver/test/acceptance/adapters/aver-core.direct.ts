import { expect } from 'vitest'
import {
  implement,
  defineDomain as realDefineDomain,
  action as realAction,
  query as realQuery,
  assertion as realAssertion,
  suite as realSuite,
  direct,
} from '../../../src/index'
import type { Domain, Adapter, Protocol } from '../../../src/index'
import type { Suite, TraceEntry } from '../../../src/core/suite'
import { _registerAdapter, _resetRegistry } from '../../../src/core/registry'
import { averCore } from '../domains/aver-core'

interface AverTestSession {
  domain?: Domain
  extendedDomain?: Domain
  adapter?: Adapter
  suiteInstance?: Suite<any>
  lastQueryResult?: unknown
  lastQueryName?: string
}

export const averCoreAdapter = implement(averCore, {
  protocol: direct<AverTestSession>(() => {
    // Do NOT call _resetRegistry() here -- that would wipe
    // the outer adapter registration needed by the outer suite.
    return {}
  }),

  actions: {
    defineDomain: async (session, { name, actions, queries, assertions }) => {
      const actionMarkers: Record<string, any> = {}
      for (const a of actions) actionMarkers[a] = realAction()

      const queryMarkers: Record<string, any> = {}
      for (const q of queries) queryMarkers[q.name] = realQuery()

      const assertionMarkers: Record<string, any> = {}
      for (const a of assertions) assertionMarkers[a] = realAssertion()

      session.domain = realDefineDomain({
        name,
        actions: actionMarkers,
        queries: queryMarkers,
        assertions: assertionMarkers,
      })
    },

    extendDomain: async (session, { actions, queries, assertions }) => {
      if (!session.domain) throw new Error('No domain defined')
      const ext: any = {}
      if (actions) {
        ext.actions = {}
        for (const a of actions) ext.actions[a] = realAction()
      }
      if (queries) {
        ext.queries = {}
        for (const q of queries) ext.queries[q.name] = realQuery()
      }
      if (assertions) {
        ext.assertions = {}
        for (const a of assertions) ext.assertions[a] = realAssertion()
      }
      session.extendedDomain = session.domain.extend(ext)
    },

    implementDomain: async (session) => {
      const dom = session.extendedDomain ?? session.domain
      if (!dom) throw new Error('No domain defined')

      const actionHandlers: Record<string, any> = {}
      for (const name of Object.keys(dom.vocabulary.actions)) {
        actionHandlers[name] = async (_ctx: any, _payload?: any) => {}
      }

      const queryHandlers: Record<string, any> = {}
      for (const name of Object.keys(dom.vocabulary.queries)) {
        queryHandlers[name] = async () => `result:${name}`
      }

      const assertionHandlers: Record<string, any> = {}
      for (const name of Object.keys(dom.vocabulary.assertions)) {
        assertionHandlers[name] = async () => {}
      }

      const proto: Protocol<null> = {
        name: 'test-inner',
        async setup() { return null },
        async teardown() {},
      }

      session.adapter = implement(dom as any, {
        protocol: proto,
        actions: actionHandlers,
        queries: queryHandlers,
        assertions: assertionHandlers,
      })
    },

    registerAdapter: async (session) => {
      if (!session.adapter) throw new Error('No adapter created')
      _registerAdapter(session.adapter)
    },

    createSuite: async (session) => {
      const dom = session.extendedDomain ?? session.domain
      if (!dom) throw new Error('No domain defined')
      session.suiteInstance = realSuite(dom)
      await session.suiteInstance._setupForTest()
    },

    executeAction: async (session, { name, payload }) => {
      if (!session.suiteInstance) throw new Error('No suite created')
      const fn = (session.suiteInstance.domain as any)[name]
      if (!fn) throw new Error(`No action "${name}" on domain proxy`)
      await fn(payload)
    },

    executeQuery: async (session, { name }) => {
      if (!session.suiteInstance) throw new Error('No suite created')
      const fn = (session.suiteInstance.domain as any)[name]
      if (!fn) throw new Error(`No query "${name}" on domain proxy`)
      session.lastQueryResult = await fn()
      session.lastQueryName = name
    },

    executeAssertion: async (session, { name, payload }) => {
      if (!session.suiteInstance) throw new Error('No suite created')
      const fn = (session.suiteInstance.domain as any)[name]
      if (!fn) throw new Error(`No assertion "${name}" on domain proxy`)
      await fn(payload)
    },

    executeFailingAssertion: async (session, { name, payload }) => {
      if (!session.suiteInstance) throw new Error('No suite created')
      const adapter = session.adapter!
      const origAssertions = { ...adapter.handlers.assertions } as any
      origAssertions[name] = async () => {
        throw new Error(`Assertion "${name}" failed`)
      }
      ;(adapter.handlers as any).assertions = origAssertions

      const fn = (session.suiteInstance.domain as any)[name]
      try {
        await fn(payload)
        throw new Error(`Expected assertion "${name}" to fail but it passed`)
      } catch (e: any) {
        if (e.message === `Expected assertion "${name}" to fail but it passed`) throw e
        // Expected failure — assertion threw as intended
      }
    },
  },

  queries: {
    vocabularyKeys: async (session) => {
      const dom = session.extendedDomain ?? session.domain
      if (!dom) throw new Error('No domain defined')
      return {
        actions: Object.keys(dom.vocabulary.actions),
        queries: Object.keys(dom.vocabulary.queries),
        assertions: Object.keys(dom.vocabulary.assertions),
      }
    },

    actionTrace: async (session) => {
      if (!session.suiteInstance) throw new Error('No suite created')
      return session.suiteInstance._getTrace().map((e: TraceEntry) => ({
        kind: e.kind,
        name: e.name,
        status: e.status,
      }))
    },

    parentDomainName: async (session) => {
      const dom = session.extendedDomain ?? session.domain
      return dom?.parent?.name
    },
  },

  assertions: {
    hasVocabulary: async (session, { actions, queries, assertions }) => {
      const dom = session.extendedDomain ?? session.domain
      if (!dom) throw new Error('No domain defined')
      expect(Object.keys(dom.vocabulary.actions).sort()).toEqual(actions.sort())
      expect(Object.keys(dom.vocabulary.queries).sort()).toEqual(queries.sort())
      expect(Object.keys(dom.vocabulary.assertions).sort()).toEqual(assertions.sort())
    },

    adapterResolved: async (session) => {
      expect(session.adapter).toBeDefined()
      expect(session.suiteInstance).toBeDefined()
    },

    traceContains: async (session, { kind, name, status }) => {
      if (!session.suiteInstance) throw new Error('No suite created')
      const trace = session.suiteInstance._getTrace()
      const match = trace.find(
        (e: TraceEntry) => e.kind === kind && e.name === name && e.status === status,
      )
      expect(match).toBeDefined()
    },

    traceHasLength: async (session, { length }) => {
      if (!session.suiteInstance) throw new Error('No suite created')
      expect(session.suiteInstance._getTrace()).toHaveLength(length)
    },

    hasParent: async (session, { name }) => {
      const dom = session.extendedDomain ?? session.domain
      expect(dom?.parent).toBeDefined()
      expect(dom?.parent?.name).toBe(name)
    },

    queryReturned: async (session, { name, value }) => {
      expect(session.lastQueryName).toBe(name)
      expect(session.lastQueryResult).toEqual(value)
    },
  },
})
