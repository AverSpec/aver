import { readFile, appendFile, mkdir, stat, rename } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { withLock, atomicWriteFile } from '@aver/workspace'
import type { AgentEvent } from '../types.js'

/**
 * Append-only event log with automatic rotation at 5MB.
 *
 * After rotation, the current file is renamed to `events-{timestamp}.jsonl`
 * and a fresh `events.jsonl` is created on the next append. Callers using
 * `readAll()` will only see post-rotation events on the current path.
 * Rotated files are preserved in the same directory for archival.
 */
export class EventLog {
  private static readonly MAX_SIZE = 5 * 1024 * 1024 // 5MB
  private readonly filePath: string
  private readonly lockKey: string

  constructor(basePath: string) {
    this.filePath = join(basePath, 'events.jsonl')
    this.lockKey = this.filePath
  }

  static async _testFileSize(filePath: string): Promise<number> {
    try {
      const s = await stat(filePath)
      return s.size
    } catch {
      return 0
    }
  }

  async append(event: AgentEvent): Promise<void> {
    await withLock(this.lockKey, async () => {
      await mkdir(dirname(this.filePath), { recursive: true })
      await appendFile(this.filePath, JSON.stringify(event) + '\n', 'utf-8')
      // Rotate if file exceeds MAX_SIZE
      try {
        const s = await stat(this.filePath)
        if (s.size > EventLog.MAX_SIZE) {
          const ts = new Date().toISOString().replace(/[:\.]/g, '-')
          const rotatedPath = join(dirname(this.filePath), `events-${ts}.jsonl`)
          await rename(this.filePath, rotatedPath)
        }
      } catch {
        // stat can fail if file was removed externally; ignore
      }
    })
  }

  async readAll(): Promise<AgentEvent[]> {
    if (!existsSync(this.filePath)) return []
    const content = await readFile(this.filePath, 'utf-8')
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AgentEvent)
  }

  async readSince(timestamp: string): Promise<AgentEvent[]> {
    const all = await this.readAll()
    return all.filter((e) => e.timestamp >= timestamp)
  }

  async truncateBefore(timestamp: string): Promise<void> {
    await withLock(this.lockKey, async () => {
      if (!existsSync(this.filePath)) return
      const content = await readFile(this.filePath, 'utf-8')
      const all = content.split('\n').filter(Boolean).map(line => JSON.parse(line) as AgentEvent)
      const remaining = all.filter(e => e.timestamp >= timestamp)
      const output = remaining.map(e => JSON.stringify(e)).join('\n') + (remaining.length ? '\n' : '')
      await atomicWriteFile(this.filePath, output)
    })
  }
}
