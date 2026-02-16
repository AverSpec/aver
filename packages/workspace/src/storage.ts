import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Workspace } from './types.js'

export class WorkspaceStore {
  readonly filePath: string

  constructor(basePath: string, projectId: string) {
    const projectDir = join(basePath, projectId)
    mkdirSync(projectDir, { recursive: true })
    this.filePath = join(projectDir, 'workspace.json')
  }

  static withDefaults(projectId: string): WorkspaceStore {
    const basePath = join(homedir(), '.aver', 'workspaces')
    return new WorkspaceStore(basePath, projectId)
  }

  load(): Workspace {
    if (!existsSync(this.filePath)) {
      const now = new Date().toISOString()
      return {
        projectId: this.filePath.split('/').at(-2)!,
        items: [],
        createdAt: now,
        updatedAt: now
      }
    }
    return JSON.parse(readFileSync(this.filePath, 'utf-8'))
  }

  save(workspace: Workspace): void {
    workspace.updatedAt = new Date().toISOString()
    writeFileSync(this.filePath, JSON.stringify(workspace, null, 2))
  }
}
