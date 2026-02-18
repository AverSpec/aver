import type { RunStore } from '../runs.js'

export interface ToolsConfig {
  runStore?: RunStore
  workspaceBasePath?: string
  workspaceProjectId?: string
}
