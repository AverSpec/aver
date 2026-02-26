import { randomUUID } from 'node:crypto'
import type { Client } from '@libsql/client'

export interface Observation {
  id: string
  agentId: string
  scope: string
  priority: 'critical' | 'important' | 'informational'
  content: string
  tokenCount: number
  createdAt: string
  referencedAt?: string
  supersededBy?: string
}

export interface AddObservationInput {
  agentId: string
  scope: string
  priority: 'critical' | 'important' | 'informational'
  content: string
  tokenCount: number
  referencedAt?: string
}

function rowToObservation(row: Record<string, unknown>): Observation {
  return {
    id: row.id as string,
    agentId: row.agent_id as string,
    scope: row.scope as string,
    priority: row.priority as Observation['priority'],
    content: row.content as string,
    tokenCount: Number(row.token_count),
    createdAt: row.created_at as string,
    referencedAt: (row.referenced_at as string) ?? undefined,
    supersededBy: (row.superseded_by as string) ?? undefined,
  }
}

export class ObservationStore {
  constructor(private client: Client) {}

  async addObservation(input: AddObservationInput): Promise<Observation> {
    const id = randomUUID()
    const createdAt = new Date().toISOString()

    await this.client.execute({
      sql: `INSERT INTO observations (id, agent_id, scope, priority, content, token_count, created_at, referenced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        input.agentId,
        input.scope,
        input.priority,
        input.content,
        input.tokenCount,
        createdAt,
        input.referencedAt ?? null,
      ],
    })

    return {
      id,
      agentId: input.agentId,
      scope: input.scope,
      priority: input.priority,
      content: input.content,
      tokenCount: input.tokenCount,
      createdAt,
      referencedAt: input.referencedAt,
      supersededBy: undefined,
    }
  }

  async getObservation(id: string): Promise<Observation | undefined> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM observations WHERE id = ?',
      args: [id],
    })
    if (result.rows.length === 0) return undefined
    return rowToObservation(result.rows[0] as unknown as Record<string, unknown>)
  }

  async getObservations(scope: string): Promise<Observation[]> {
    const result = await this.client.execute({
      sql: `SELECT * FROM observations
            WHERE scope = ? AND superseded_by IS NULL
            ORDER BY created_at ASC`,
      args: [scope],
    })
    return result.rows.map((r) => rowToObservation(r as unknown as Record<string, unknown>))
  }

  async getObservationsForSupervisor(): Promise<Observation[]> {
    const result = await this.client.execute({
      sql: `SELECT * FROM observations
            WHERE superseded_by IS NULL
              AND (scope = 'project' OR scope = 'strategy' OR scope LIKE 'scenario:%')
            ORDER BY created_at ASC`,
      args: [],
    })
    return result.rows.map((r) => rowToObservation(r as unknown as Record<string, unknown>))
  }

  async getObservationsForWorker(agentId: string, scenarioId: string): Promise<Observation[]> {
    const result = await this.client.execute({
      sql: `SELECT * FROM observations
            WHERE superseded_by IS NULL
              AND (scope = 'project' OR scope = ? OR scope = ?)
            ORDER BY created_at ASC`,
      args: [`scenario:${scenarioId}`, `agent:${agentId}`],
    })
    return result.rows.map((r) => rowToObservation(r as unknown as Record<string, unknown>))
  }

  async supersede(oldId: string, newId: string): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE observations SET superseded_by = ? WHERE id = ?',
      args: [newId, oldId],
    })
  }

  async getTokenCount(scope: string): Promise<number> {
    const result = await this.client.execute({
      sql: `SELECT COALESCE(SUM(token_count), 0) as total
            FROM observations
            WHERE scope = ? AND superseded_by IS NULL`,
      args: [scope],
    })
    return Number(result.rows[0].total)
  }

  async getTotalTokenCount(): Promise<number> {
    const result = await this.client.execute({
      sql: `SELECT COALESCE(SUM(token_count), 0) as total
            FROM observations
            WHERE superseded_by IS NULL`,
      args: [],
    })
    return Number(result.rows[0].total)
  }
}
