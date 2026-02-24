/**
 * Framework internals — registry functions and test-runner globals.
 * Import from '@aver/core/internals' to keep your imports explicit.
 * These are also re-exported from '@aver/core' for backward compatibility.
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
} from './core/registry'

export { getGlobalTest, getGlobalDescribe } from './core/test-registration'
