import type { Protocol } from '../core/protocol'

/**
 * A protocol for direct function calls. The factory creates
 * the context (typically the system under test or its state).
 * Teardown is a no-op.
 */
export function direct<T>(factory: () => T | Promise<T>): Protocol<T> {
  return {
    name: 'direct',
    async setup() {
      return await factory()
    },
    async teardown() {},
  }
}
