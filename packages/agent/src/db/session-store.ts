import { randomUUID } from 'node:crypto'
import type { Client } from '@libsql/client'

export interface Session {
  id: string
  goal: string
  status: 'running' | 'paused' | 'complete' | 'error'
  tokenUsage: { supervisor: number; worker: number; observer: number; reflector: number }
  createdAt: string
  updatedAt: string
}

const ZERO_TOKEN_USAGE: Session['tokenUsage'] = {
  supervisor: 0,
  worker: 0,
  observer: 0,
  reflector: 0,
}

function rowToSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    goal: row.goal as string,
    status: row.status as Session['status'],
    tokenUsage: row.token_usage
      ? (JSON.parse(row.token_usage as string) as Session['tokenUsage'])
      : { ...ZERO_TOKEN_USAGE },
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export class SessionStore {
  constructor(private client: Client) {}

  async createSession(input: { goal: string }): Promise<Session> {
    const id = randomUUID()
    const now = new Date().toISOString()
    const tokenUsage = { ...ZERO_TOKEN_USAGE }

    await this.client.execute({
      sql: `INSERT INTO sessions (id, goal, status, token_usage, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, input.goal, 'running', JSON.stringify(tokenUsage), now, now],
    })

    return {
      id,
      goal: input.goal,
      status: 'running',
      tokenUsage,
      createdAt: now,
      updatedAt: now,
    }
  }

  async getSession(id: string): Promise<Session | undefined> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM sessions WHERE id = ?',
      args: [id],
    })
    if (result.rows.length === 0) return undefined
    return rowToSession(result.rows[0] as unknown as Record<string, unknown>)
  }

  async updateSession(
    id: string,
    fields: Partial<Pick<Session, 'status' | 'tokenUsage'>>,
  ): Promise<void> {
    const updates: string[] = []
    const args: string[] = []

    if (fields.status !== undefined) {
      updates.push('status = ?')
      args.push(fields.status)
    }
    if (fields.tokenUsage !== undefined) {
      updates.push('token_usage = ?')
      args.push(JSON.stringify(fields.tokenUsage))
    }

    if (updates.length === 0) return

    updates.push('updated_at = ?')
    args.push(new Date().toISOString())
    args.push(id)

    await this.client.execute({
      sql: `UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`,
      args,
    })
  }

  async getCurrentSession(): Promise<Session | undefined> {
    const result = await this.client.execute({
      sql: `SELECT * FROM sessions WHERE status = 'running' ORDER BY created_at DESC LIMIT 1`,
      args: [],
    })
    if (result.rows.length === 0) return undefined
    return rowToSession(result.rows[0] as unknown as Record<string, unknown>)
  }
}
