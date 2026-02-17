import { isDeepStrictEqual } from 'node:util'
import {
  implement,
  defineDomain as realDefineDomain,
  action as realAction,
  query as realQuery,
  assertion as realAssertion,
  suite as realSuite,
  unit,
} from '../../../src/index'
import type { Domain, Adapter, Protocol } from '../../../src/index'
import type { SuiteReturn } from '../../../src/core/suite'
import type { TraceEntry } from '../../../src/core/trace'
import { registerAdapter } from '../../../src/core/registry'
import { averCore } from '../domains/aver-core'

interface AverTestSession {
  domain?: Domain
  extendedDomain?: Domain
  adapter?: Adapter
  suiteInstance?: SuiteReturn<any>
  lastQueryResult?: unknown
  lastQueryName?: string
}

export const averCoreAdapter = implement(averCore, {
  protocol: unit<AverTestSession>(() => {
    // Do NOT call resetRegistry() here -- that would wipe
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
      registerAdapter(session.adapter)
    },

    createSuite: async (session) => {
      const dom = session.extendedDomain ?? session.domain
      if (!dom) throw new Error('No domain defined')
      session.suiteInstance = realSuite(dom)
      await session.suiteInstance.setup()
    },

    executeAction: async (session, { name, payload }) => {
      if (!session.suiteInstance) throw new Error('No suite created')
      const fn = (session.suiteInstance.act as any)[name]
      if (!fn) throw new Error(`No action "${name}" on domain proxy`)
      await fn(payload)
    },

    executeQuery: async (session, { name }) => {
      if (!session.suiteInstance) throw new Error('No suite created')
      const fn = (session.suiteInstance.query as any)[name]
      if (!fn) throw new Error(`No query "${name}" on domain proxy`)
      session.lastQueryResult = await fn()
      session.lastQueryName = name
    },

    executeAssertion: async (session, { name, payload }) => {
      if (!session.suiteInstance) throw new Error('No suite created')
      const fn = (session.suiteInstance.assert as any)[name]
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

      const fn = (session.suiteInstance.assert as any)[name]
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
      return session.suiteInstance.getTrace().map((e: TraceEntry) => ({
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
      const actualActions = Object.keys(dom.vocabulary.actions).sort()
      const actualQueries = Object.keys(dom.vocabulary.queries).sort()
      const actualAssertions = Object.keys(dom.vocabulary.assertions).sort()
      if (!isDeepStrictEqual(actualActions, [...actions].sort()))
        throw new Error(`Expected actions ${JSON.stringify(actions.sort())} but got ${JSON.stringify(actualActions)}`)
      if (!isDeepStrictEqual(actualQueries, [...queries].sort()))
        throw new Error(`Expected queries ${JSON.stringify(queries.sort())} but got ${JSON.stringify(actualQueries)}`)
      if (!isDeepStrictEqual(actualAssertions, [...assertions].sort()))
        throw new Error(`Expected assertions ${JSON.stringify(assertions.sort())} but got ${JSON.stringify(actualAssertions)}`)
    },

    adapterResolved: async (session) => {
      if (!session.adapter) throw new Error('Expected adapter to be defined')
      if (!session.suiteInstance) throw new Error('Expected suiteInstance to be defined')
    },

    traceContains: async (session, { kind, name, status }) => {
      if (!session.suiteInstance) throw new Error('No suite created')
      const trace = session.suiteInstance.getTrace()
      const match = trace.find(
        (e: TraceEntry) => e.kind === kind && e.name === name && e.status === status,
      )
      if (!match)
        throw new Error(`Expected trace to contain {kind: "${kind}", name: "${name}", status: "${status}"}`)
    },

    traceHasLength: async (session, { length }) => {
      if (!session.suiteInstance) throw new Error('No suite created')
      const actual = session.suiteInstance.getTrace().length
      if (actual !== length)
        throw new Error(`Expected trace length ${length} but got ${actual}`)
    },

    hasParent: async (session, { name }) => {
      const dom = session.extendedDomain ?? session.domain
      if (!dom?.parent) throw new Error('Expected domain to have a parent')
      if (dom.parent.name !== name)
        throw new Error(`Expected parent name "${name}" but got "${dom.parent.name}"`)
    },

    queryReturned: async (session, { name, value }) => {
      if (session.lastQueryName !== name)
        throw new Error(`Expected last query "${name}" but got "${session.lastQueryName}"`)
      if (!isDeepStrictEqual(session.lastQueryResult, value))
        throw new Error(`Expected query result ${JSON.stringify(value)} but got ${JSON.stringify(session.lastQueryResult)}`)
    },
  },
})
