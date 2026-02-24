import type { AdapterOperator } from '../engine-types.js'

/**
 * Replace handler with a no-op.
 * Tests if the absence of the handler's behavior is detected.
 */
export function removalOperator(): AdapterOperator {
  return {
    name: 'removal',
    targets: 'all',
    mutate(_handlerName: string, handler: Function): Function {
      // For queries, return undefined (empty result)
      // For actions/assertions, do nothing
      return async () => undefined
    },
  }
}
