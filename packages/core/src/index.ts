// User-facing API
export { action, query, assertion } from './core/markers'
export { defineDomain } from './core/domain'
export { implement } from './core/adapter'
export { suite } from './core/suite'
export { compose } from './core/compose'
export { defineConfig } from './core/config'
export { unit } from './protocols/unit'
export { withFixture } from './core/protocol'
export { getTestContext, runWithTestContext } from './core/test-context'

// Internals — also available via '@aver/core/internals'
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
  getGlobalTest,
  getGlobalDescribe,
  resetCoverageConfig,
} from './internals'

export type { ActionMarker, QueryMarker, AssertionMarker } from './core/types'
export type { Domain } from './core/domain'
export type { Adapter } from './core/adapter'
export type { Protocol, TestMetadata, TestCompletion } from './core/protocol'
export type { RunningTestContext } from './core/test-context'
export type { ProtocolExtensions, Screenshotter } from './core/extensions'
export type { RegistrySnapshot } from './core/registry'
export type { AverConfig, AverConfigInput, CoverageConfig, TeardownFailureMode } from './core/config'
export { getCoverageConfig, getTeardownFailureMode } from './core/config'
export type { VocabularyCoverage } from './core/coverage'
export type { TraceEntry, TraceAttachment } from './core/trace'
export type { ActProxy, QueryProxy, AssertProxy, TestContext, SuiteReturn, PlannedTest } from './core/suite'
export type { Clock, StepCategory } from './core/proxy'
export type { ComposeReturn, ComposedTestContext } from './core/compose'
