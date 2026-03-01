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

/**
 * Validate that a projectId contains only safe characters.
 * Allows alphanumeric, dashes, underscores, and dots — but rejects
 * path separators, standalone dot-dot segments, and empty strings.
 */
export function validateProjectId(id: string): string {
  if (!id) {
    throw new Error('projectId must not be empty')
  }
  if (/[/\\]/.test(id)) {
    throw new Error(`projectId contains path separators: ${id}`)
  }
  // Reject "." and ".." and segments like "../foo" / "foo/.."
  if (id === '.' || id === '..' || id.startsWith('../') || id.endsWith('/..') || id.includes('/../')) {
    throw new Error(`projectId contains path traversal: ${id}`)
  }
  // Only allow alphanumeric, dash, underscore, dot
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
    throw new Error(`projectId contains invalid characters: ${id}`)
  }
  return id
}

export function resolveProjectId(): string {
  const raw = _config?.workspaceProjectId ?? process.env.AVER_PROJECT_ID ?? basename(process.cwd())
  return validateProjectId(raw)
}

// --- Store cache ---

const storeCache = new Map<string, WorkspaceStore>()

export function getCachedStore(basePath: string, projectId: string): WorkspaceStore {
  const key = `${basePath}\0${projectId}`
  const cached = storeCache.get(key)
  if (cached) return cached
  const store = WorkspaceStore.fromPath(basePath, projectId)
  storeCache.set(key, store)
  return store
}

/**
 * Clear the cached WorkspaceStore/WorkspaceOps instances.
 * Called when config is reloaded so stale state is not retained.
 */
export function clearWorkspaceCache(): void {
  storeCache.clear()
}
