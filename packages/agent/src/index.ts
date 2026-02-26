// Experimental: tested against mock dispatchers only, not yet validated with real LLMs end-to-end.
// @aver/agent — AI agent platform for domain-driven development

// ── Public types (legacy, used by TUI and eval) ──────────────────────
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
  WorkerDispatch,
  WorkerInput,
  WorkerResult,
  FailedWorker,
  ScenarioUpdate,
} from './types.js'

export { DEFAULT_CONFIG } from './types.js'

// ── v2 Network ───────────────────────────────────────────────────────
export { AgentNetwork } from './network/index.js'
export { TriggerQueue } from './network/index.js'
export type {
  AgentNetworkConfig,
  AgentNetworkCallbacks,
  Dispatchers,
  DispatchResult,
  SupervisorDecision,
} from './network/index.js'
export type { Trigger, TriggerType } from './network/index.js'

// ── v2 Database ──────────────────────────────────────────────────────
export { createDatabase, closeDatabase } from './db/index.js'
export { ObservationStore, AgentStore, SessionStore, EventStore } from './db/index.js'
export type { Observation } from './db/index.js'
export type { Session } from './db/index.js'
export type { Agent } from './db/index.js'
export type { AgentEvent as DbAgentEvent } from './db/index.js'

// ── v2 Observe ───────────────────────────────────────────────────────
export { Observer, Reflector, ObservationBuffer } from './observe/index.js'

// ── v2 Context ───────────────────────────────────────────────────────
export { ContextAssembler } from './context/index.js'
export type { ContextWindow, ContextAssemblerConfig } from './context/index.js'

// ── Dispatcher prompt builders (needed to implement custom Dispatchers) ─
export type { SupervisorResult, SupervisorPromptInput, ActiveWorkerInfo } from './supervisor/dispatch.js'
export { buildPrompts as buildSupervisorPrompts } from './supervisor/dispatch.js'
export { DecisionParseError, parseDecision } from './supervisor/decisions.js'
export type { WorkerDispatchResult, WorkerPromptInput } from './worker/dispatch.js'
export { buildWorkerPrompts } from './worker/dispatch.js'

// ── CLI (consumed by @aver/core) ────────────────────────────────────
export { parseAgentArgs, printAgentHelp } from './cli.js'
export type { AgentArgs } from './cli.js'

// ── CLI operations (session/event reads for CLI commands) ─────────
export { loadSession, readEvents, requestStop } from './cli-ops.js'

// ── Dogfood domains ─────────────────────────────────────────────────
export { AverAgent } from './domain.js'
export { AverTui } from './tui-domain.js'
