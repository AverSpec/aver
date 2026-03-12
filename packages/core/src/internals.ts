/**
 * Framework internals — registry functions, test-runner globals, and
 * implementation details used by sibling @aver/* packages and tests.
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

export { resetCoverageConfig, getCoverageConfig, getTeardownFailureMode } from './core/config'
export type { CoverageConfig, TeardownFailureMode } from './core/config'

export type { VocabularyCoverage } from './core/coverage'

export { verifyCorrelation } from './core/correlation'
export type { CorrelationResult, CorrelationGroup, CorrelationViolation } from './core/correlation'

export type { RunningTestContext } from './core/test-context'

export type { ActionMarker, QueryMarker, AssertionMarker, TelemetryExpectation, TelemetryDeclaration, TelemetryAttributeValue, AsymmetricMatcher } from './core/types'

export type { ActProxy, QueryProxy, AssertProxy, PlannedTest, SuiteConfig, NamedContext, NamedTestContext, NamedSuiteReturn } from './core/suite'

export type { Clock, StepCategory, TelemetryVerificationMode, ProxyOptions } from './core/proxy'

export { runTelemetryVerify, parseVerifyArgs } from './cli/telemetry'
export type { VerifyArgs, VerifyOutput } from './cli/telemetry'
