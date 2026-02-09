import { defineDomain, action, query, assertion } from 'aver'

/**
 * Acceptance domain for the Aver MCP server.
 * Models: setting up test domains, calling MCP tool handlers, verifying results.
 */
export const averMcp = defineDomain({
  name: 'AverMcp',
  actions: {
    /** Register a test domain with the given vocabulary into the registry. */
    registerTestDomain: action<{
      name: string
      actions: string[]
      queries: string[]
      assertions: string[]
    }>(),
    /** Call an MCP tool handler by name with optional input. */
    callTool: action<{ tool: string; input?: Record<string, unknown> }>(),
    /** Save a test run to the run store. */
    saveTestRun: action<{
      results: Array<{
        testName: string
        domain: string
        status: 'pass' | 'fail' | 'skip'
        trace: Array<{ kind: string; name: string; status: string; error?: string }>
      }>
    }>(),
    /** Clear the registry and run store for test isolation. */
    resetState: action(),
  },
  queries: {
    /** Get the result from the last tool call (parsed JSON). */
    lastToolResult: query<unknown>(),
  },
  assertions: {
    /** Assert the last tool result contains the expected data. */
    toolResultContains: assertion<{ path: string; expected: unknown }>(),
    /** Assert the last tool result is an array of a specific length. */
    toolResultHasLength: assertion<{ length: number }>(),
    /** Assert the last tool call returned an error/not-found message. */
    toolResultIsError: assertion<{ substring: string }>(),
  },
})
