import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase, closeDatabase } from '../../src/db/index.js'
import { ObservationStore } from '../../src/db/observation-store.js'
import type { Client } from '@libsql/client'

describe('ObservationStore', () => {
  let client: Client
  let store: ObservationStore

  beforeEach(async () => {
    client = await createDatabase(':memory:')
    store = new ObservationStore(client)
  })

  afterEach(() => {
    closeDatabase(client)
  })

  describe('CRUD', () => {
    it('addObservation inserts and returns observation with generated id and createdAt', async () => {
      const obs = await store.addObservation({
        agentId: 'agent-1',
        scope: 'project',
        priority: 'critical',
        content: 'The build system uses tsup',
        tokenCount: 12,
      })

      expect(obs.id).toBeTypeOf('string')
      expect(obs.id.length).toBeGreaterThan(0)
      expect(obs.agentId).toBe('agent-1')
      expect(obs.scope).toBe('project')
      expect(obs.priority).toBe('critical')
      expect(obs.content).toBe('The build system uses tsup')
      expect(obs.tokenCount).toBe(12)
      expect(obs.createdAt).toBeTypeOf('string')
      expect(obs.supersededBy).toBeUndefined()
    })

    it('addObservation stores optional referencedAt', async () => {
      const obs = await store.addObservation({
        agentId: 'agent-1',
        scope: 'project',
        priority: 'informational',
        content: 'Found in README',
        tokenCount: 5,
        referencedAt: '2026-02-26T00:00:00.000Z',
      })

      expect(obs.referencedAt).toBe('2026-02-26T00:00:00.000Z')
    })

    it('getObservation returns single observation by id', async () => {
      const created = await store.addObservation({
        agentId: 'agent-1',
        scope: 'project',
        priority: 'important',
        content: 'Test content',
        tokenCount: 3,
      })

      const fetched = await store.getObservation(created.id)
      expect(fetched).toBeDefined()
      expect(fetched!.id).toBe(created.id)
      expect(fetched!.content).toBe('Test content')
    })

    it('getObservation returns undefined for missing id', async () => {
      const result = await store.getObservation('nonexistent-id')
      expect(result).toBeUndefined()
    })

    it('getObservations returns observations for a scope, ordered by createdAt', async () => {
      await store.addObservation({
        agentId: 'agent-1',
        scope: 'project',
        priority: 'critical',
        content: 'First',
        tokenCount: 1,
      })
      await store.addObservation({
        agentId: 'agent-2',
        scope: 'project',
        priority: 'informational',
        content: 'Second',
        tokenCount: 2,
      })
      await store.addObservation({
        agentId: 'agent-1',
        scope: 'strategy',
        priority: 'important',
        content: 'Different scope',
        tokenCount: 3,
      })

      const projectObs = await store.getObservations('project')
      expect(projectObs).toHaveLength(2)
      expect(projectObs[0].content).toBe('First')
      expect(projectObs[1].content).toBe('Second')
    })

    it('supersede sets supersededBy on old observation', async () => {
      const old = await store.addObservation({
        agentId: 'agent-1',
        scope: 'project',
        priority: 'critical',
        content: 'Old observation',
        tokenCount: 5,
      })
      const replacement = await store.addObservation({
        agentId: 'agent-1',
        scope: 'project',
        priority: 'critical',
        content: 'New observation',
        tokenCount: 6,
      })

      await store.supersede(old.id, replacement.id)

      const updated = await store.getObservation(old.id)
      expect(updated!.supersededBy).toBe(replacement.id)
    })
  })

  describe('scope filtering', () => {
    beforeEach(async () => {
      // Seed observations across all scope types
      await store.addObservation({
        agentId: 'supervisor',
        scope: 'project',
        priority: 'critical',
        content: 'Project-level observation',
        tokenCount: 10,
      })
      await store.addObservation({
        agentId: 'supervisor',
        scope: 'strategy',
        priority: 'important',
        content: 'Strategy observation',
        tokenCount: 8,
      })
      await store.addObservation({
        agentId: 'worker-1',
        scope: 'scenario:sc-1',
        priority: 'informational',
        content: 'Scenario 1 observation',
        tokenCount: 6,
      })
      await store.addObservation({
        agentId: 'worker-2',
        scope: 'scenario:sc-2',
        priority: 'informational',
        content: 'Scenario 2 observation',
        tokenCount: 5,
      })
      await store.addObservation({
        agentId: 'worker-1',
        scope: 'agent:worker-1',
        priority: 'important',
        content: 'Worker 1 private',
        tokenCount: 4,
      })
      await store.addObservation({
        agentId: 'worker-2',
        scope: 'agent:worker-2',
        priority: 'important',
        content: 'Worker 2 private',
        tokenCount: 3,
      })
    })

    it('getObservationsForSupervisor returns project + strategy + scenario scopes', async () => {
      const obs = await store.getObservationsForSupervisor()
      const scopes = obs.map((o) => o.scope)

      expect(scopes).toContain('project')
      expect(scopes).toContain('strategy')
      expect(scopes).toContain('scenario:sc-1')
      expect(scopes).toContain('scenario:sc-2')
    })

    it('getObservationsForSupervisor does NOT return agent-private observations', async () => {
      const obs = await store.getObservationsForSupervisor()
      const scopes = obs.map((o) => o.scope)

      expect(scopes).not.toContain('agent:worker-1')
      expect(scopes).not.toContain('agent:worker-2')
    })

    it('getObservationsForWorker returns project + own agent scope + matching scenario', async () => {
      const obs = await store.getObservationsForWorker('worker-1', 'sc-1')
      const scopes = obs.map((o) => o.scope)

      expect(scopes).toContain('project')
      expect(scopes).toContain('scenario:sc-1')
      expect(scopes).toContain('agent:worker-1')
    })

    it('getObservationsForWorker does NOT return other agents private observations', async () => {
      const obs = await store.getObservationsForWorker('worker-1', 'sc-1')
      const scopes = obs.map((o) => o.scope)

      expect(scopes).not.toContain('agent:worker-2')
    })

    it('getObservationsForWorker does NOT return strategy observations', async () => {
      const obs = await store.getObservationsForWorker('worker-1', 'sc-1')
      const scopes = obs.map((o) => o.scope)

      expect(scopes).not.toContain('strategy')
    })

    it('getObservationsForWorker does NOT return other scenario observations', async () => {
      const obs = await store.getObservationsForWorker('worker-1', 'sc-1')
      const scopes = obs.map((o) => o.scope)

      expect(scopes).not.toContain('scenario:sc-2')
    })

    it('superseded observations excluded from getObservationsForSupervisor', async () => {
      const all = await store.getObservationsForSupervisor()
      const projectObs = all.find((o) => o.scope === 'project')!

      const replacement = await store.addObservation({
        agentId: 'supervisor',
        scope: 'project',
        priority: 'critical',
        content: 'Updated project observation',
        tokenCount: 12,
      })
      await store.supersede(projectObs.id, replacement.id)

      const afterSupersede = await store.getObservationsForSupervisor()
      const projectObs2 = afterSupersede.filter((o) => o.scope === 'project')
      expect(projectObs2).toHaveLength(1)
      expect(projectObs2[0].content).toBe('Updated project observation')
    })

    it('superseded observations excluded from getObservationsForWorker', async () => {
      const all = await store.getObservationsForWorker('worker-1', 'sc-1')
      const agentObs = all.find((o) => o.scope === 'agent:worker-1')!

      const replacement = await store.addObservation({
        agentId: 'worker-1',
        scope: 'agent:worker-1',
        priority: 'important',
        content: 'Updated worker 1 private',
        tokenCount: 5,
      })
      await store.supersede(agentObs.id, replacement.id)

      const afterSupersede = await store.getObservationsForWorker('worker-1', 'sc-1')
      const agentObs2 = afterSupersede.filter((o) => o.scope === 'agent:worker-1')
      expect(agentObs2).toHaveLength(1)
      expect(agentObs2[0].content).toBe('Updated worker 1 private')
    })

    it('superseded observations excluded from getObservations', async () => {
      const before = await store.getObservations('project')
      expect(before).toHaveLength(1)

      const replacement = await store.addObservation({
        agentId: 'supervisor',
        scope: 'project',
        priority: 'critical',
        content: 'Replacement',
        tokenCount: 5,
      })
      await store.supersede(before[0].id, replacement.id)

      const after = await store.getObservations('project')
      expect(after).toHaveLength(1)
      expect(after[0].content).toBe('Replacement')
    })

    it('results are ordered by createdAt ASC', async () => {
      const obs = await store.getObservationsForSupervisor()
      for (let i = 1; i < obs.length; i++) {
        expect(obs[i].createdAt >= obs[i - 1].createdAt).toBe(true)
      }
    })
  })

  describe('token accounting', () => {
    it('getTokenCount returns sum for non-superseded observations in scope', async () => {
      await store.addObservation({
        agentId: 'agent-1',
        scope: 'project',
        priority: 'critical',
        content: 'A',
        tokenCount: 10,
      })
      await store.addObservation({
        agentId: 'agent-1',
        scope: 'project',
        priority: 'important',
        content: 'B',
        tokenCount: 20,
      })
      await store.addObservation({
        agentId: 'agent-1',
        scope: 'strategy',
        priority: 'informational',
        content: 'C',
        tokenCount: 5,
      })

      const count = await store.getTokenCount('project')
      expect(count).toBe(30)
    })

    it('getTotalTokenCount returns sum across all non-superseded observations', async () => {
      await store.addObservation({
        agentId: 'agent-1',
        scope: 'project',
        priority: 'critical',
        content: 'A',
        tokenCount: 10,
      })
      await store.addObservation({
        agentId: 'agent-1',
        scope: 'strategy',
        priority: 'important',
        content: 'B',
        tokenCount: 20,
      })

      const total = await store.getTotalTokenCount()
      expect(total).toBe(30)
    })

    it('superseded observations are not counted in getTokenCount', async () => {
      const old = await store.addObservation({
        agentId: 'agent-1',
        scope: 'project',
        priority: 'critical',
        content: 'Old',
        tokenCount: 100,
      })
      const replacement = await store.addObservation({
        agentId: 'agent-1',
        scope: 'project',
        priority: 'critical',
        content: 'New',
        tokenCount: 50,
      })
      await store.supersede(old.id, replacement.id)

      const count = await store.getTokenCount('project')
      expect(count).toBe(50)
    })

    it('superseded observations are not counted in getTotalTokenCount', async () => {
      const old = await store.addObservation({
        agentId: 'agent-1',
        scope: 'project',
        priority: 'critical',
        content: 'Old',
        tokenCount: 100,
      })
      const replacement = await store.addObservation({
        agentId: 'agent-1',
        scope: 'project',
        priority: 'critical',
        content: 'New',
        tokenCount: 50,
      })
      await store.supersede(old.id, replacement.id)

      const total = await store.getTotalTokenCount()
      expect(total).toBe(50)
    })

    it('getTokenCount returns 0 for empty scope', async () => {
      const count = await store.getTokenCount('nonexistent')
      expect(count).toBe(0)
    })

    it('getTotalTokenCount returns 0 for empty database', async () => {
      const total = await store.getTotalTokenCount()
      expect(total).toBe(0)
    })
  })
})
