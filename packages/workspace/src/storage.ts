import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { SafeJsonFile } from './safe-json-file.js'
import type { Workspace } from './types.js'

export class WorkspaceStore {
  readonly filePath: string
  private readonly file: SafeJsonFile<Workspace>

  constructor(basePath: string, projectId: string) {
    const projectDir = join(basePath, projectId)
    mkdirSync(projectDir, { recursive: true })
    this.filePath = join(projectDir, 'workspace.json')
    this.file = new SafeJsonFile(this.filePath, () => {
      const now = new Date().toISOString()
      return {
        projectId,
        scenarios: [],
        createdAt: now,
        updatedAt: now,
      }
    })
  }

  static withDefaults(projectId: string): WorkspaceStore {
    const basePath = join(homedir(), '.aver', 'workspaces')
    return new WorkspaceStore(basePath, projectId)
  }

  async load(): Promise<Workspace> {
    return this.file.read()
  }

  async mutate(fn: (ws: Workspace) => Workspace): Promise<Workspace> {
    return this.file.mutate(ws => {
      const updated = fn(ws)
      updated.updatedAt = new Date().toISOString()
      return updated
    })
  }
}
