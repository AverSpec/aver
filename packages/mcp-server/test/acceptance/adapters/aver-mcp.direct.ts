import { expect } from 'vitest'
import {
  implement,
  defineDomain as realDefineDomain,
  action as realAction,
  query as realQuery,
  assertion as realAssertion,
  direct,
  _registerAdapter,
  _resetRegistry,
} from 'aver'
import type { Protocol } from 'aver'
import { averMcp } from '../domains/aver-mcp'
import {
  listDomainsHandler,
  getDomainVocabularyHandler,
  listAdaptersHandler,
} from '../../../src/tools/domains'

interface McpTestSession {
  lastToolResult?: unknown
}

export const averMcpAdapter = implement(averMcp, {
  protocol: direct<McpTestSession>(() => {
    // Do NOT call _resetRegistry() here -- that would wipe
    // the outer adapter registration needed by the outer suite.
    // Registry isolation is handled by beforeEach in the test files.
    return {}
  }),

  actions: {
    registerTestDomain: async (_session, { name, actions, queries, assertions }) => {
      const actionMarkers: Record<string, any> = {}
      for (const a of actions) actionMarkers[a] = realAction()

      const queryMarkers: Record<string, any> = {}
      for (const q of queries) queryMarkers[q] = realQuery()

      const assertionMarkers: Record<string, any> = {}
      for (const a of assertions) assertionMarkers[a] = realAssertion()

      const domain = realDefineDomain({
        name,
        actions: actionMarkers,
        queries: queryMarkers,
        assertions: assertionMarkers,
      })

      const proto: Protocol<null> = {
        name: 'test-inner',
        async setup() { return null },
        async teardown() {},
      }

      const adapter = implement(domain as any, {
        protocol: proto,
        actions: Object.fromEntries(Object.keys(actionMarkers).map(k => [k, async () => {}])),
        queries: Object.fromEntries(Object.keys(queryMarkers).map(k => [k, async () => `result:${k}`])),
        assertions: Object.fromEntries(Object.keys(assertionMarkers).map(k => [k, async () => {}])),
      })

      _registerAdapter(adapter)
    },

    callTool: async (session, { tool, input }) => {
      switch (tool) {
        case 'list_domains':
          session.lastToolResult = listDomainsHandler()
          break
        case 'get_domain_vocabulary':
          session.lastToolResult = getDomainVocabularyHandler(input?.domain as string)
          break
        case 'list_adapters':
          session.lastToolResult = listAdaptersHandler()
          break
        default:
          throw new Error(`Unknown tool: ${tool}`)
      }
    },

    saveTestRun: async () => {
      // Will be implemented when RunStore is added (Task 4)
    },

    resetState: async (session) => {
      _resetRegistry()
      _registerAdapter(averMcpAdapter)
      session.lastToolResult = undefined
    },
  },

  queries: {
    lastToolResult: async (session) => {
      return session.lastToolResult
    },
  },

  assertions: {
    toolResultContains: async (session, { path, expected }) => {
      const result = session.lastToolResult
      // Navigate the path (e.g. "0.name" -> result[0].name)
      const parts = path.split('.')
      let current: any = result
      for (const part of parts) {
        if (current == null) {
          throw new Error(`Path "${path}" not found in result: ${JSON.stringify(result)}`)
        }
        current = Array.isArray(current) ? current[Number(part)] : current[part]
      }
      expect(current).toEqual(expected)
    },

    toolResultHasLength: async (session, { length }) => {
      expect(session.lastToolResult).toHaveLength(length)
    },

    toolResultIsError: async (session, { substring }) => {
      const result = session.lastToolResult
      if (result === null || result === undefined) {
        // null result means "not found" -- this is expected for missing domains
        return
      }
      if (typeof result === 'string') {
        expect(result).toContain(substring)
        return
      }
      throw new Error(`Expected error result but got: ${JSON.stringify(result)}`)
    },
  },
})
