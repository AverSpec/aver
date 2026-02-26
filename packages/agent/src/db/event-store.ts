import { randomUUID } from 'node:crypto'
import type { Client } from '@libsql/client'

export interface AgentEvent {
  id: string
  agentId?: string
  type: string
  data: Record<string, unknown>
  createdAt: string
}

function rowToEvent(row: Record<string, unknown>): AgentEvent {
  return {
    id: row.id as string,
    agentId: (row.agent_id as string) ?? undefined,
    type: row.type as string,
    data: row.data ? (JSON.parse(row.data as string) as Record<string, unknown>) : {},
    createdAt: row.created_at as string,
  }
}

export class EventStore {
  constructor(private client: Client) {}

  async logEvent(input: {
    agentId?: string
    type: string
    data: Record<string, unknown>
  }): Promise<AgentEvent> {
    const id = randomUUID()
    const createdAt = new Date().toISOString()

    await this.client.execute({
      sql: `INSERT INTO events (id, agent_id, type, data, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [id, input.agentId ?? null, input.type, JSON.stringify(input.data), createdAt],
    })

    return {
      id,
      agentId: input.agentId,
      type: input.type,
      data: input.data,
      createdAt,
    }
  }

  async getEvents(): Promise<AgentEvent[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM events ORDER BY created_at ASC',
      args: [],
    })
    return result.rows.map((r) => rowToEvent(r as unknown as Record<string, unknown>))
  }

  async getEventsByType(type: string): Promise<AgentEvent[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM events WHERE type = ? ORDER BY created_at ASC',
      args: [type],
    })
    return result.rows.map((r) => rowToEvent(r as unknown as Record<string, unknown>))
  }

  async getEventsSince(timestamp: string): Promise<AgentEvent[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM events WHERE created_at > ? ORDER BY created_at ASC',
      args: [timestamp],
    })
    return result.rows.map((r) => rowToEvent(r as unknown as Record<string, unknown>))
  }
}
