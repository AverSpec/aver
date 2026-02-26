import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase, closeDatabase } from '../../src/db/index.js'
import { AgentStore } from '../../src/db/agent-store.js'
import type { Client } from '@libsql/client'

describe('AgentStore', () => {
  let client: Client
  let store: AgentStore

  beforeEach(async () => {
    client = await createDatabase(':memory:')
    store = new AgentStore(client)
  })

  afterEach(() => {
    closeDatabase(client)
  })

  describe('createAgent', () => {
    it('creates a worker with generated id, createdAt, and status=idle', async () => {
      const agent = await store.createAgent({
        role: 'worker',
        goal: 'investigate X',
      })

      expect(agent.id).toBeTypeOf('string')
      expect(agent.id.length).toBeGreaterThan(0)
      expect(agent.role).toBe('worker')
      expect(agent.status).toBe('idle')
      expect(agent.goal).toBe('investigate X')
      expect(agent.createdAt).toBeTypeOf('string')
      expect(agent.updatedAt).toBeTypeOf('string')
      expect(agent.createdAt).toBe(agent.updatedAt)
    })

    it('creates a supervisor', async () => {
      const agent = await store.createAgent({
        role: 'supervisor',
        goal: 'orchestrate',
      })

      expect(agent.role).toBe('supervisor')
      expect(agent.status).toBe('idle')
      expect(agent.goal).toBe('orchestrate')
    })

    it('stores optional fields: skill, permission, scenarioId, model', async () => {
      const agent = await store.createAgent({
        role: 'worker',
        goal: 'implement feature',
        skill: 'investigation',
        permission: 'edit',
        scenarioId: 'sc-1',
        model: 'claude-sonnet-4-20250514',
      })

      expect(agent.skill).toBe('investigation')
      expect(agent.permission).toBe('edit')
      expect(agent.scenarioId).toBe('sc-1')
      expect(agent.model).toBe('claude-sonnet-4-20250514')
    })
  })

  describe('getAgent', () => {
    it('returns agent by id', async () => {
      const created = await store.createAgent({
        role: 'worker',
        goal: 'test goal',
      })

      const fetched = await store.getAgent(created.id)
      expect(fetched).toBeDefined()
      expect(fetched!.id).toBe(created.id)
      expect(fetched!.goal).toBe('test goal')
      expect(fetched!.role).toBe('worker')
      expect(fetched!.status).toBe('idle')
    })

    it('returns undefined for missing id', async () => {
      const result = await store.getAgent('nonexistent-id')
      expect(result).toBeUndefined()
    })
  })

  describe('updateAgent', () => {
    it('updates status and updatedAt', async () => {
      const created = await store.createAgent({
        role: 'worker',
        goal: 'test',
      })
      const originalUpdatedAt = created.updatedAt

      // Small delay to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 5))

      await store.updateAgent(created.id, { status: 'active' })

      const fetched = await store.getAgent(created.id)
      expect(fetched!.status).toBe('active')
      expect(fetched!.updatedAt).not.toBe(originalUpdatedAt)
    })

    it('updates goal', async () => {
      const created = await store.createAgent({
        role: 'worker',
        goal: 'old goal',
      })

      await store.updateAgent(created.id, { goal: 'new goal' })

      const fetched = await store.getAgent(created.id)
      expect(fetched!.goal).toBe('new goal')
    })

    it('updates skill', async () => {
      const created = await store.createAgent({
        role: 'worker',
        goal: 'test',
      })

      await store.updateAgent(created.id, { skill: 'implementation' })

      const fetched = await store.getAgent(created.id)
      expect(fetched!.skill).toBe('implementation')
    })

    it('updates scenarioId', async () => {
      const created = await store.createAgent({
        role: 'worker',
        goal: 'test',
      })

      await store.updateAgent(created.id, { scenarioId: 'sc-42' })

      const fetched = await store.getAgent(created.id)
      expect(fetched!.scenarioId).toBe('sc-42')
    })
  })

  describe('getActiveWorkers', () => {
    it('returns workers where status != terminated', async () => {
      const w1 = await store.createAgent({ role: 'worker', goal: 'task 1' })
      await store.createAgent({ role: 'worker', goal: 'task 2' })
      const w3 = await store.createAgent({ role: 'worker', goal: 'task 3' })

      await store.updateAgent(w1.id, { status: 'active' })
      await store.terminateAgent(w3.id)

      const active = await store.getActiveWorkers()
      expect(active).toHaveLength(2)
      const goals = active.map((a) => a.goal)
      expect(goals).toContain('task 1')
      expect(goals).toContain('task 2')
      expect(goals).not.toContain('task 3')
    })

    it('does NOT return supervisor', async () => {
      await store.createAgent({ role: 'supervisor', goal: 'orchestrate' })
      await store.createAgent({ role: 'worker', goal: 'task' })

      const active = await store.getActiveWorkers()
      expect(active).toHaveLength(1)
      expect(active[0].role).toBe('worker')
    })
  })

  describe('getSupervisor', () => {
    it('returns the supervisor agent', async () => {
      await store.createAgent({ role: 'supervisor', goal: 'orchestrate' })
      await store.createAgent({ role: 'worker', goal: 'task' })

      const supervisor = await store.getSupervisor()
      expect(supervisor).toBeDefined()
      expect(supervisor!.role).toBe('supervisor')
      expect(supervisor!.goal).toBe('orchestrate')
    })

    it('returns undefined when no supervisor exists', async () => {
      await store.createAgent({ role: 'worker', goal: 'task' })

      const supervisor = await store.getSupervisor()
      expect(supervisor).toBeUndefined()
    })

    it('does not return terminated supervisor', async () => {
      const sup = await store.createAgent({ role: 'supervisor', goal: 'orchestrate' })
      await store.terminateAgent(sup.id)

      const supervisor = await store.getSupervisor()
      expect(supervisor).toBeUndefined()
    })
  })

  describe('terminateAgent', () => {
    it('sets status to terminated and updates updatedAt', async () => {
      const created = await store.createAgent({
        role: 'worker',
        goal: 'task',
      })
      const originalUpdatedAt = created.updatedAt

      await new Promise((r) => setTimeout(r, 5))

      await store.terminateAgent(created.id)

      const fetched = await store.getAgent(created.id)
      expect(fetched!.status).toBe('terminated')
      expect(fetched!.updatedAt).not.toBe(originalUpdatedAt)
    })
  })
})
