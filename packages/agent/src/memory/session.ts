import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { AgentSession } from '../types.js'

export class SessionStore {
  private readonly filePath: string

  constructor(basePath: string) {
    this.filePath = join(basePath, 'session.json')
  }

  async create(goal: string): Promise<AgentSession> {
    const now = new Date().toISOString()
    const session: AgentSession = {
      id: `session-${now.slice(0, 10)}-${randomUUID().slice(0, 8)}`,
      goal,
      status: 'running',
      cycleCount: 0,
      workerCount: 0,
      tokenUsage: { supervisor: 0, worker: 0 },
      createdAt: now,
      updatedAt: now,
    }
    await this.save(session)
    return session
  }

  async load(): Promise<AgentSession | undefined> {
    if (!existsSync(this.filePath)) return undefined
    const content = await readFile(this.filePath, 'utf-8')
    return JSON.parse(content) as AgentSession
  }

  async update(partial: Partial<AgentSession>): Promise<AgentSession> {
    const session = await this.load()
    if (!session) throw new Error('No active session')
    const updated = { ...session, ...partial, updatedAt: new Date().toISOString() }
    await this.save(updated)
    return updated
  }

  private async save(session: AgentSession): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(session, null, 2), 'utf-8')
  }
}
