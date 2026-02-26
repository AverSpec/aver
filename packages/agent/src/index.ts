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
  FailedWorker,
  ScenarioUpdate,
} from './types.js'

export { DEFAULT_CONFIG } from './types.js'

// ── Dispatcher result types (needed to implement custom Dispatchers) ─
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
