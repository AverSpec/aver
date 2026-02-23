import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { SafeJsonFile } from '@aver/workspace'
import type { AgentSession } from '../types.js'

export class SessionStore {
  private readonly file: SafeJsonFile<AgentSession | null>

  constructor(basePath: string) {
    const filePath = join(basePath, 'session.json')
    this.file = new SafeJsonFile(filePath, () => null)
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
    await this.file.write(session)
    return session
  }

  async load(): Promise<AgentSession | undefined> {
    const session = await this.file.read()
    return session ?? undefined
  }

  async update(partial: Partial<AgentSession>): Promise<AgentSession> {
    return this.file.mutate(session => {
      if (!session) throw new Error('No active session')
      return { ...session, ...partial, updatedAt: new Date().toISOString() }
    }) as Promise<AgentSession>
  }

  async recordWorkerCompletion(workerTokenUsage: number): Promise<AgentSession> {
    return this.file.mutate(session => {
      if (!session) throw new Error('No active session')
      return {
        ...session,
        workerCount: session.workerCount + 1,
        tokenUsage: {
          supervisor: session.tokenUsage.supervisor,
          worker: session.tokenUsage.worker + workerTokenUsage,
        },
        updatedAt: new Date().toISOString(),
      }
    }) as Promise<AgentSession>
  }

  async recordCycleCompletion(supervisorTokenUsage: number): Promise<AgentSession> {
    return this.file.mutate(session => {
      if (!session) throw new Error('No active session')
      return {
        ...session,
        cycleCount: session.cycleCount + 1,
        tokenUsage: {
          supervisor: session.tokenUsage.supervisor + supervisorTokenUsage,
          worker: session.tokenUsage.worker,
        },
        updatedAt: new Date().toISOString(),
      }
    }) as Promise<AgentSession>
  }

  async updateStatus(status: AgentSession['status'], lastError?: string): Promise<AgentSession> {
    return this.file.mutate(session => {
      if (!session) throw new Error('No active session')
      return { ...session, status, lastError, updatedAt: new Date().toISOString() }
    }) as Promise<AgentSession>
  }
}
