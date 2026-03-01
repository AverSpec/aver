// @aver/workspace — Scenario workspace for the Aver workflow
export { createScenario, createExample } from './types.js'
export type { Scenario, Workspace, Example, Question, Stage, Transition } from './types.js'
export { WorkspaceStore, initWorkspaceSchema } from './storage.js'
export { WorkspaceOps, verifyAdvancement, nextStage, STAGE_ORDER, AdvancementBlockedError } from './operations.js'
export type { AdvanceInput, AdvanceResult, RevisitInput, RevisitResult, AdvancementVerification, ScenarioFilter, ScenarioSummary, ScenarioUpdateInput, BatchAdvanceInput, BatchAdvanceResult, BatchAdvanceItemResult, BatchRevisitInput, BatchRevisitResult, BatchRevisitItemResult } from './operations.js'
export { exportMarkdown, exportJson, importJson } from './export.js'
export { detectPhase } from './phase.js'
export type { Phase, PhaseName } from './phase.js'
export { SafeJsonFile, atomicWriteFile, atomicWriteFileSync, withLock } from './safe-json-file.js'

// Backlog
export { BacklogOps } from './backlog-ops.js'
export { createBacklogItem } from './backlog-types.js'
export type {
  BacklogItem,
  BacklogItemReference,
  BacklogStatus,
  BacklogPriority,
  BacklogItemType,
  BacklogFilter,
  BacklogSummary,
  BacklogMoveTarget,
  BacklogItemUpdateInput,
} from './backlog-types.js'
