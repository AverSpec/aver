// Experimental: tested against mock dispatchers only, not yet validated with real LLMs end-to-end.
// @aver/agent — AI agent platform for domain-driven development

// ── Public types ────────────────────────────────────────────────────
export type {
  AgentSession,
  AgentConfig,
  ArtifactType,
  ArtifactEntry,
  ArtifactContent,
  NewArtifact,
  EventType,
  AgentEvent,
  WorkspaceSnapshot,
  SupervisorInput,
  SupervisorDecision,
  WorkerDispatch,
  WorkerInput,
  WorkerResult,
  ScenarioUpdate,
} from './types.js'

export { DEFAULT_CONFIG } from './types.js'

// ── Engine (main entry point) ───────────────────────────────────────
export { CycleEngine } from './shell/engine.js'
export type { Dispatchers, EngineOptions } from './shell/engine.js'

// ── Dispatcher result types (needed to implement custom Dispatchers) ─
export type { SupervisorResult } from './supervisor/dispatch.js'
export type { WorkerDispatchResult } from './worker/dispatch.js'
export { DecisionParseError } from './supervisor/decisions.js'

// ── CLI (consumed by @aver/core) ────────────────────────────────────
export { parseAgentArgs, printAgentHelp } from './cli.js'
export type { AgentArgs } from './cli.js'

// ── CLI operations (session/event reads for CLI commands) ─────────
export { loadSession, readEvents, requestStop } from './cli-ops.js'

// ── Dogfood domains ─────────────────────────────────────────────────
export { AverAgent } from './domain.js'
export { AverTui } from './tui-domain.js'
