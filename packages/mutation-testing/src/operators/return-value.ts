import type { AdapterOperator } from '../engine-types.js'

/**
 * Mutate query return values: return null, empty string, empty array, or 0.
 * Tests if the caller properly validates query results.
 */
export function returnValueOperator(replacement: unknown = null): AdapterOperator {
  return {
    name: `return-value(${JSON.stringify(replacement)})`,
    targets: 'queries',
    mutate(_handlerName: string, _handler: Function): Function {
      return async () => replacement
    },
  }
}
