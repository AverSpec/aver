import { isDeepStrictEqual } from 'node:util'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  implement,
  defineDomain as realDefineDomain,
  action as realAction,
  query as realQuery,
  assertion as realAssertion,
  unit,
  registerAdapter,
  resetRegistry,
} from '@aver/core'
import type { Protocol } from '@aver/core'
import { averMcp } from '../domains/aver-mcp'
import {
  listDomainsHandler,
  getDomainVocabularyHandler,
  listAdaptersHandler,
} from '../../../src/tools/domains'
import { RunStore } from '../../../src/runs'
import {
  getFailureDetailsHandler,
  getTestTraceHandler,
} from '../../../src/tools/execution'
import {
  describeDomainStructureHandler,
  describeAdapterStructureHandler,
} from '../../../src/tools/scaffolding'
import { getRunDiffHandler } from '../../../src/tools/reporting'

interface McpTestSession {
  lastToolResult?: unknown
  runStore?: RunStore
}

export const averMcpAdapter = implement(averMcp, {
  protocol: unit<McpTestSession>(() => {
    // Do NOT call resetRegistry() here -- that would wipe
    // the outer adapter registration needed by the outer suite.
    // Registry isolation is handled by beforeEach in the test files.
    const runStoreDir = mkdtempSync(join(tmpdir(), 'aver-mcp-test-'))
    return { runStore: new RunStore(runStoreDir) }
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

      registerAdapter(adapter)
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
          session.lastToolResult = await listAdaptersHandler()
          break
        case 'get_failure_details': {
          const result = getFailureDetailsHandler(session.runStore!, {
            domain: input?.domain as string | undefined,
            testName: input?.testName as string | undefined,
          })
          session.lastToolResult = result
          break
        }
        case 'get_test_trace': {
          const result = getTestTraceHandler(session.runStore!, input?.testName as string)
          if (!result) {
            session.lastToolResult = `Test "${input?.testName}" not found in latest run`
          } else {
            session.lastToolResult = result
          }
          break
        }
        case 'describe_domain_structure': {
          session.lastToolResult = describeDomainStructureHandler(input?.description as string)
          break
        }
        case 'describe_adapter_structure': {
          const result = describeAdapterStructureHandler(
            input?.domain as string,
            input?.protocol as string,
          )
          if (!result) {
            session.lastToolResult = `Adapter for domain "${input?.domain}" with protocol "${input?.protocol}" not found`
          } else {
            session.lastToolResult = result
          }
          break
        }
        case 'get_run_diff': {
          const diff = getRunDiffHandler(session.runStore!)
          if (!diff) {
            session.lastToolResult = 'Need at least 2 test runs to compare.'
          } else {
            session.lastToolResult = diff
          }
          break
        }
        default:
          throw new Error(`Unknown tool: ${tool}`)
      }
    },

    saveTestRun: async (session, { results }) => {
      session.runStore!.save({
        timestamp: new Date().toISOString(),
        results,
      })
    },

    resetState: async (session) => {
      resetRegistry()
      registerAdapter(averMcpAdapter)
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
      if (!isDeepStrictEqual(current, expected))
        throw new Error(`Expected ${JSON.stringify(expected)} at path "${path}" but got ${JSON.stringify(current)}`)
    },

    toolResultHasLength: async (session, { length }) => {
      const result = session.lastToolResult as any
      if (!result || result.length !== length)
        throw new Error(`Expected result length ${length} but got ${result?.length ?? 'undefined'}`)
    },

    toolResultIsError: async (session, { substring }) => {
      const result = session.lastToolResult
      if (result === null || result === undefined) {
        // null result means "not found" -- this is expected for missing domains
        return
      }
      if (typeof result === 'string') {
        if (!result.includes(substring))
          throw new Error(`Expected error to contain "${substring}" but got: ${result}`)
        return
      }
      throw new Error(`Expected error result but got: ${JSON.stringify(result)}`)
    },
  },
})
