import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import type { AgentEvent } from '../types.js'

export class EventLog {
  private readonly filePath: string

  constructor(basePath: string) {
    this.filePath = join(basePath, 'events.jsonl')
  }

  async append(event: AgentEvent): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    await appendFile(this.filePath, JSON.stringify(event) + '\n', 'utf-8')
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
    const remaining = await this.readSince(timestamp)
    const content = remaining.map((e) => JSON.stringify(e)).join('\n') + (remaining.length ? '\n' : '')
    await writeFile(this.filePath, content, 'utf-8')
  }
}
