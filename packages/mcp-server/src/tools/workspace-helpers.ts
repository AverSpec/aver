import { basename } from 'node:path'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { WorkspaceStore } from '@aver/agent'
import type { ToolsConfig } from './types.js'

// --- Config ---

let _config: ToolsConfig | undefined

export function setToolsConfig(config?: ToolsConfig): void {
  _config = config
}

// --- Path resolution ---

export function resolveBasePath(): string {
  return _config?.workspaceBasePath ?? process.env.AVER_WORKSPACE_PATH ?? join(homedir(), '.aver', 'workspaces')
}

export function resolveProjectId(): string {
  return _config?.workspaceProjectId ?? process.env.AVER_PROJECT_ID ?? basename(process.cwd())
}

// --- Store cache ---

let cachedStore: WorkspaceStore | undefined
let cachedStoreKey: string | undefined

export function getCachedStore(basePath: string, projectId: string): WorkspaceStore {
  const key = `${basePath}\0${projectId}`
  if (cachedStore && cachedStoreKey === key) return cachedStore
  cachedStore = WorkspaceStore.fromPath(basePath, projectId)
  cachedStoreKey = key
  return cachedStore
}

/**
 * Clear the cached WorkspaceStore/WorkspaceOps instance.
 * Called when config is reloaded so stale state is not retained.
 */
export function clearWorkspaceCache(): void {
  cachedStore = undefined
  cachedStoreKey = undefined
}
