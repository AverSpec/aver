import { resetRegistry } from './registry'
import { resetCoverageConfig } from './config'
import { clearExtractionRegistry } from './extract-registry'

/**
 * Reset all framework-level mutable state to defaults.
 * Call this in test teardown (afterEach/beforeEach) to ensure clean state.
 *
 * Resets:
 * - Adapter/domain registry (including config autoload flag)
 * - Coverage config
 * - Contract extraction registry
 */
export function resetAll(): void {
  resetRegistry()
  resetCoverageConfig()
  clearExtractionRegistry()
}
