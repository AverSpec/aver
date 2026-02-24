import type { AdapterOperator } from '../engine-types.js'

/**
 * Replace handler with one that throws an error.
 * Tests if error handling paths are covered by specs.
 */
export function throwErrorOperator(): AdapterOperator {
  return {
    name: 'throw-error',
    targets: 'all',
    mutate(_handlerName: string, _handler: Function): Function {
      return async () => {
        throw new Error('Mutation: simulated error')
      }
    },
  }
}
