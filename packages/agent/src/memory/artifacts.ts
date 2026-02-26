import { readFile, mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { atomicWriteFile } from '@aver/workspace'
import type { Client } from '@libsql/client'
import type { ArtifactEntry, ArtifactContent, NewArtifact } from '../types.js'

export class ArtifactStore {
  private readonly dir: string
  private readonly archiveDir: string
  private readonly db: Client

  constructor(basePath: string, db: Client) {
    this.dir = join(basePath, 'artifacts')
    this.archiveDir = join(this.dir, 'archive')
    this.db = db
  }

  async write(artifact: NewArtifact): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    // Step 1: Write content atomically (each artifact is a distinct file)
    await atomicWriteFile(join(this.dir, `${artifact.name}.md`), artifact.content)
    // Step 2: Upsert index row
    await this.db.execute({
      sql: `INSERT OR REPLACE INTO artifacts (name, type, summary, scenario_id, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        artifact.name,
        artifact.type,
        artifact.summary,
        artifact.scenarioId ?? null,
        new Date().toISOString(),
      ],
    })
  }

  async read(name: string): Promise<ArtifactContent | undefined> {
    const result = await this.db.execute({
      sql: 'SELECT name, type, summary, scenario_id, created_at FROM artifacts WHERE name = ?',
      args: [name],
    })
    if (result.rows.length === 0) return undefined
    const row = result.rows[0]
    const contentPath = join(this.dir, `${name}.md`)
    if (!existsSync(contentPath)) return undefined
    const content = await readFile(contentPath, 'utf-8')
    return {
      name: row.name as string,
      type: row.type as ArtifactEntry['type'],
      summary: row.summary as string,
      scenarioId: (row.scenario_id as string) || undefined,
      createdAt: row.created_at as string,
      content,
    }
  }

  async readArchived(name: string): Promise<ArtifactContent | undefined> {
    const contentPath = join(this.archiveDir, `${name}.md`)
    if (!existsSync(contentPath)) return undefined
    const content = await readFile(contentPath, 'utf-8')
    const metaPath = join(this.archiveDir, `${name}.meta.json`)
    if (existsSync(metaPath)) {
      const meta: ArtifactEntry = JSON.parse(await readFile(metaPath, 'utf-8'))
      return { ...meta, content }
    }
    return { name, type: 'investigation', summary: '', content, createdAt: '' }
  }

  async getIndex(): Promise<ArtifactEntry[]> {
    const result = await this.db.execute(
      'SELECT name, type, summary, scenario_id, created_at FROM artifacts',
    )
    return result.rows.map(row => ({
      name: row.name as string,
      type: row.type as ArtifactEntry['type'],
      summary: row.summary as string,
      scenarioId: (row.scenario_id as string) || undefined,
      createdAt: row.created_at as string,
    }))
  }

  async archive(name: string): Promise<void> {
    await mkdir(this.archiveDir, { recursive: true })
    // Read entry metadata before removing from index
    const result = await this.db.execute({
      sql: 'SELECT name, type, summary, scenario_id, created_at FROM artifacts WHERE name = ?',
      args: [name],
    })
    if (result.rows.length > 0) {
      const row = result.rows[0]
      const entry: ArtifactEntry = {
        name: row.name as string,
        type: row.type as ArtifactEntry['type'],
        summary: row.summary as string,
        scenarioId: (row.scenario_id as string) || undefined,
        createdAt: row.created_at as string,
      }
      await writeFile(
        join(this.archiveDir, `${name}.meta.json`),
        JSON.stringify(entry),
        'utf-8',
      )
    }
    // Move content file
    const srcPath = join(this.dir, `${name}.md`)
    const destPath = join(this.archiveDir, `${name}.md`)
    if (existsSync(srcPath)) {
      await rename(srcPath, destPath)
    }
    // Remove from index
    await this.db.execute({
      sql: 'DELETE FROM artifacts WHERE name = ?',
      args: [name],
    })
  }
}
