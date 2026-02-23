import { readFile, appendFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { withLock, atomicWriteFile } from '@aver/workspace'
import type { AgentEvent } from '../types.js'

export class EventLog {
  private readonly filePath: string
  private readonly lockKey: string

  constructor(basePath: string) {
    this.filePath = join(basePath, 'events.jsonl')
    this.lockKey = this.filePath
  }

  async append(event: AgentEvent): Promise<void> {
    await withLock(this.lockKey, async () => {
      await mkdir(dirname(this.filePath), { recursive: true })
      await appendFile(this.filePath, JSON.stringify(event) + '\n', 'utf-8')
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
