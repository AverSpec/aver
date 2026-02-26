import { randomUUID } from 'node:crypto'
import type { Client } from '@libsql/client'

export interface Agent {
  id: string
  role: 'supervisor' | 'worker'
  status: 'idle' | 'active' | 'terminated'
  goal: string
  skill?: string
  permission?: string
  scenarioId?: string
  model?: string
  createdAt: string
  updatedAt: string
}

export interface CreateAgentInput {
  role: 'supervisor' | 'worker'
  goal: string
  skill?: string
  permission?: string
  scenarioId?: string
  model?: string
}

function rowToAgent(row: Record<string, unknown>): Agent {
  return {
    id: row.id as string,
    role: row.role as Agent['role'],
    status: row.status as Agent['status'],
    goal: row.goal as string,
    skill: (row.skill as string) ?? undefined,
    permission: (row.permission as string) ?? undefined,
    scenarioId: (row.scenario_id as string) ?? undefined,
    model: (row.model as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export class AgentStore {
  constructor(private client: Client) {}

  async createAgent(input: CreateAgentInput): Promise<Agent> {
    const id = randomUUID()
    const now = new Date().toISOString()

    await this.client.execute({
      sql: `INSERT INTO agents (id, role, status, goal, skill, permission, scenario_id, model, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        input.role,
        'idle',
        input.goal,
        input.skill ?? null,
        input.permission ?? null,
        input.scenarioId ?? null,
        input.model ?? null,
        now,
        now,
      ],
    })

    return {
      id,
      role: input.role,
      status: 'idle',
      goal: input.goal,
      skill: input.skill,
      permission: input.permission,
      scenarioId: input.scenarioId,
      model: input.model,
      createdAt: now,
      updatedAt: now,
    }
  }

  async getAgent(id: string): Promise<Agent | undefined> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM agents WHERE id = ?',
      args: [id],
    })
    if (result.rows.length === 0) return undefined
    return rowToAgent(result.rows[0] as unknown as Record<string, unknown>)
  }

  async updateAgent(
    id: string,
    fields: Partial<Pick<Agent, 'status' | 'goal' | 'skill' | 'scenarioId'>>,
  ): Promise<void> {
    const setClauses: string[] = []
    const args: unknown[] = []

    if (fields.status !== undefined) {
      setClauses.push('status = ?')
      args.push(fields.status)
    }
    if (fields.goal !== undefined) {
      setClauses.push('goal = ?')
      args.push(fields.goal)
    }
    if (fields.skill !== undefined) {
      setClauses.push('skill = ?')
      args.push(fields.skill)
    }
    if (fields.scenarioId !== undefined) {
      setClauses.push('scenario_id = ?')
      args.push(fields.scenarioId)
    }

    if (setClauses.length === 0) return

    setClauses.push('updated_at = ?')
    args.push(new Date().toISOString())
    args.push(id)

    await this.client.execute({
      sql: `UPDATE agents SET ${setClauses.join(', ')} WHERE id = ?`,
      args: args as Array<string | number | null>,
    })
  }

  async getActiveWorkers(): Promise<Agent[]> {
    const result = await this.client.execute({
      sql: `SELECT * FROM agents WHERE role = ? AND status != ? ORDER BY created_at ASC`,
      args: ['worker', 'terminated'],
    })
    return result.rows.map((r) => rowToAgent(r as unknown as Record<string, unknown>))
  }

  async getSupervisor(): Promise<Agent | undefined> {
    const result = await this.client.execute({
      sql: `SELECT * FROM agents WHERE role = ? AND status != ? LIMIT 1`,
      args: ['supervisor', 'terminated'],
    })
    if (result.rows.length === 0) return undefined
    return rowToAgent(result.rows[0] as unknown as Record<string, unknown>)
  }

  async terminateAgent(id: string): Promise<void> {
    await this.client.execute({
      sql: `UPDATE agents SET status = ?, updated_at = ? WHERE id = ?`,
      args: ['terminated', new Date().toISOString(), id],
    })
  }
}
