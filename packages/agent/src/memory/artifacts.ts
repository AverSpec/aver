import { readFile, mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { SafeJsonFile, atomicWriteFile } from '@aver/workspace'
import type { ArtifactEntry, ArtifactContent, NewArtifact } from '../types.js'

interface IndexData {
  artifacts: ArtifactEntry[]
}

export class ArtifactStore {
  private readonly dir: string
  private readonly archiveDir: string
  private readonly indexFile: SafeJsonFile<IndexData>

  constructor(basePath: string) {
    this.dir = join(basePath, 'artifacts')
    this.archiveDir = join(this.dir, 'archive')
    this.indexFile = new SafeJsonFile(
      join(this.dir, 'index.json'),
      () => ({ artifacts: [] }),
    )
  }

  async write(artifact: NewArtifact): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    // Step 1: Write content atomically (each artifact is a distinct file)
    await atomicWriteFile(join(this.dir, `${artifact.name}.md`), artifact.content)
    // Step 2: Update index under mutex
    await this.indexFile.mutate(index => {
      const entry: ArtifactEntry = {
        name: artifact.name,
        type: artifact.type,
        summary: artifact.summary,
        scenarioId: artifact.scenarioId,
        createdAt: new Date().toISOString(),
      }
      const existing = index.artifacts.findIndex(a => a.name === artifact.name)
      if (existing >= 0) {
        index.artifacts[existing] = entry
      } else {
        index.artifacts.push(entry)
      }
      return index
    })
  }

  async read(name: string): Promise<ArtifactContent | undefined> {
    const index = await this.indexFile.read()
    const entry = index.artifacts.find(a => a.name === name)
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
    const metaPath = join(this.archiveDir, `${name}.meta.json`)
    if (existsSync(metaPath)) {
      const meta: ArtifactEntry = JSON.parse(await readFile(metaPath, 'utf-8'))
      return { ...meta, content }
    }
    return { name, type: 'investigation', summary: '', content, createdAt: '' }
  }

  async getIndex(): Promise<ArtifactEntry[]> {
    const index = await this.indexFile.read()
    return index.artifacts
  }

  async archive(name: string): Promise<void> {
    await mkdir(this.archiveDir, { recursive: true })
    // Read entry metadata before removing from index
    const index = await this.indexFile.read()
    const entry = index.artifacts.find(a => a.name === name)
    if (entry) {
      await writeFile(
        join(this.archiveDir, `${name}.meta.json`),
        JSON.stringify(entry),
        'utf-8',
      )
    }
    // Move content file (not under mutex — distinct file)
    const srcPath = join(this.dir, `${name}.md`)
    const destPath = join(this.archiveDir, `${name}.md`)
    if (existsSync(srcPath)) {
      await rename(srcPath, destPath)
    }
    // Remove from index under mutex
    await this.indexFile.mutate(idx => ({
      artifacts: idx.artifacts.filter(a => a.name !== name),
    }))
  }
}
