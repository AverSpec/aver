import type { Protocol } from '../core/protocol'

/**
 * A protocol for unit-level testing with direct function calls.
 * The factory creates the context (typically the system under test).
 * Teardown is a no-op.
 */
export function unit<T>(factory: () => T | Promise<T>): Protocol<T> {
  return {
    name: 'unit',
    async setup() {
      return await factory()
    },
    async teardown() {},
  }
}
