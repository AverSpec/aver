import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createClient, type Client } from '@libsql/client'
import type { Workspace, Scenario } from './types.js'
import type { BacklogItem } from './backlog-types.js'

const CURRENT_VERSION = '1.0.0'

const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS scenarios (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
)`

const META_SQL = `CREATE TABLE IF NOT EXISTS workspace_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`

const BACKLOG_SQL = `CREATE TABLE IF NOT EXISTS backlog_items (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
)`

export async function initWorkspaceSchema(client: Client): Promise<void> {
  await client.execute(SCHEMA_SQL)
  await client.execute(META_SQL)
  await client.execute(BACKLOG_SQL)
}

export class WorkspaceStore {
  private initialized = false

  constructor(
    private readonly client: Client,
    private readonly projectId: string,
  ) {}

  /**
   * Create a WorkspaceStore backed by a SQLite file at `basePath/projectId/workspace.db`.
   */
  static fromPath(basePath: string, projectId: string): WorkspaceStore {
    const projectDir = join(basePath, projectId)
    mkdirSync(projectDir, { recursive: true })
    const dbPath = join(projectDir, 'workspace.db')
    const client = createClient({ url: `file:${dbPath}` })
    return new WorkspaceStore(client, projectId)
  }

  /**
   * Create a WorkspaceStore at the default location: `~/.aver/workspaces/<projectId>/workspace.db`.
   */
  static withDefaults(projectId: string): WorkspaceStore {
    const basePath = join(homedir(), '.aver', 'workspaces')
    return WorkspaceStore.fromPath(basePath, projectId)
  }

  private async ensureSchema(): Promise<void> {
    if (this.initialized) return
    await initWorkspaceSchema(this.client)
    this.initialized = true
  }

  async load(): Promise<Workspace> {
    await this.ensureSchema()
    const result = await this.client.execute('SELECT data FROM scenarios ORDER BY rowid')
    const scenarios: Scenario[] = result.rows.map(row => JSON.parse(row.data as string))

    const metaResult = await this.client.execute(
      "SELECT value FROM workspace_meta WHERE key = 'created_at'"
    )
    const createdAt = metaResult.rows.length > 0
      ? metaResult.rows[0].value as string
      : new Date().toISOString()

    return {
      schemaVersion: CURRENT_VERSION,
      projectId: this.projectId,
      scenarios,
      createdAt,
      updatedAt: new Date().toISOString(),
    }
  }

  async mutate(fn: (ws: Workspace) => Workspace): Promise<Workspace> {
    await this.ensureSchema()

    const ws = await this.load()
    const updated = fn(ws)
    updated.updatedAt = new Date().toISOString()

    // Rebuild scenarios table from the mutated workspace
    await this.client.execute('DELETE FROM scenarios')
    for (const scenario of updated.scenarios) {
      await this.client.execute({
        sql: 'INSERT INTO scenarios (id, data) VALUES (?, ?)',
        args: [scenario.id, JSON.stringify(scenario)],
      })
    }

    // Store metadata
    await this.client.execute({
      sql: "INSERT OR REPLACE INTO workspace_meta (key, value) VALUES ('created_at', ?)",
      args: [updated.createdAt],
    })

    return updated
  }

  async loadBacklogItems(): Promise<BacklogItem[]> {
    await this.ensureSchema()
    const result = await this.client.execute('SELECT data FROM backlog_items ORDER BY rowid')
    return result.rows.map(row => JSON.parse(row.data as string))
  }

  async mutateBacklog(fn: (items: BacklogItem[]) => BacklogItem[]): Promise<BacklogItem[]> {
    await this.ensureSchema()
    const items = await this.loadBacklogItems()
    const updated = fn(items)

    await this.client.execute('DELETE FROM backlog_items')
    for (const item of updated) {
      await this.client.execute({
        sql: 'INSERT INTO backlog_items (id, data) VALUES (?, ?)',
        args: [item.id, JSON.stringify(item)],
      })
    }

    return updated
  }
}
