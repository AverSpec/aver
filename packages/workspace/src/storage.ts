import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { SafeJsonFile } from './safe-json-file.js'
import type { Workspace } from './types.js'

type Migration = (data: any) => any

const CURRENT_VERSION = '1.0.0'

const migrations: Record<string, Migration> = {
  // Example: '0.9.0': (data) => ({ ...data, schemaVersion: '1.0.0', newField: 'default' })
}

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
        schemaVersion: CURRENT_VERSION,
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
    const data = await this.file.read()
    return this.migrate(data)
  }

  async mutate(fn: (ws: Workspace) => Workspace): Promise<Workspace> {
    return this.file.mutate(ws => {
      const updated = fn(ws)
      updated.updatedAt = new Date().toISOString()
      return updated
    })
  }

  private migrate(data: Workspace): Workspace {
    if (!data.schemaVersion) {
      // Pre-versioning data — treat as 1.0.0
      data.schemaVersion = CURRENT_VERSION
    }
    // When adding the first real migration, iterate the `migrations` record
    // in version order: while (data.schemaVersion !== CURRENT_VERSION) apply
    // migrations[data.schemaVersion], then update data.schemaVersion.
    return data
  }
}
