import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { ArtifactEntry, ArtifactContent, NewArtifact } from '../types.js'

interface IndexData {
  artifacts: ArtifactEntry[]
}

export class ArtifactStore {
  private readonly dir: string
  private readonly archiveDir: string
  private readonly indexPath: string

  constructor(basePath: string) {
    this.dir = join(basePath, 'artifacts')
    this.archiveDir = join(this.dir, 'archive')
    this.indexPath = join(this.dir, 'index.json')
  }

  async write(artifact: NewArtifact): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    const entry: ArtifactEntry = {
      name: artifact.name,
      type: artifact.type,
      summary: artifact.summary,
      scenarioId: artifact.scenarioId,
      createdAt: new Date().toISOString(),
    }
    await writeFile(join(this.dir, `${artifact.name}.md`), artifact.content, 'utf-8')
    const index = await this.loadIndex()
    const existing = index.artifacts.findIndex((a) => a.name === artifact.name)
    if (existing >= 0) {
      index.artifacts[existing] = entry
    } else {
      index.artifacts.push(entry)
    }
    await this.saveIndex(index)
  }

  async read(name: string): Promise<ArtifactContent | undefined> {
    const index = await this.loadIndex()
    const entry = index.artifacts.find((a) => a.name === name)
    if (!entry) return undefined
    const contentPath = join(this.dir, `${name}.md`)
    if (!existsSync(contentPath)) return undefined
    const content = await readFile(contentPath, 'utf-8')
    return { ...entry, content }
  }

  async readArchived(name: string): Promise<ArtifactContent | undefined> {
    const contentPath = join(this.archiveDir, `${name}.md`)
    if (!existsSync(contentPath)) return undefined
    const content = await readFile(contentPath, 'utf-8')
    return { name, type: 'investigation', summary: '', content, createdAt: '' }
  }

  async getIndex(): Promise<ArtifactEntry[]> {
    const index = await this.loadIndex()
    return index.artifacts
  }

  async archive(name: string): Promise<void> {
    await mkdir(this.archiveDir, { recursive: true })
    const srcPath = join(this.dir, `${name}.md`)
    const destPath = join(this.archiveDir, `${name}.md`)
    if (existsSync(srcPath)) {
      await rename(srcPath, destPath)
    }
    const index = await this.loadIndex()
    index.artifacts = index.artifacts.filter((a) => a.name !== name)
    await this.saveIndex(index)
  }

  private async loadIndex(): Promise<IndexData> {
    if (!existsSync(this.indexPath)) return { artifacts: [] }
    const content = await readFile(this.indexPath, 'utf-8')
    return JSON.parse(content) as IndexData
  }

  private async saveIndex(index: IndexData): Promise<void> {
    await writeFile(this.indexPath, JSON.stringify(index, null, 2), 'utf-8')
  }
}
