/**
 * Framework internals — registry functions and test-runner globals.
 * Import from '@aver/core/internals' to keep your imports explicit.
 * These are NOT re-exported from '@aver/core' — use this subpath entry.
 */
export {
  registerDomain,
  registerAdapter,
  getDomains,
  getDomain,
  getAdapters,
  findAdapter,
  findAdapters,
  resetRegistry,
  getRegistrySnapshot,
  restoreRegistrySnapshot,
  withRegistry,
} from './core/registry'

export type { RegistrySnapshot } from './core/registry'

export { getGlobalTest, getGlobalDescribe } from './core/test-registration'

export { resetCoverageConfig } from './core/config'
