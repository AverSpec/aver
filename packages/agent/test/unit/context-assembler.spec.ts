import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase, closeDatabase } from '../../src/db/index.js'
import { ObservationStore } from '../../src/db/observation-store.js'
import { ContextAssembler } from '../../src/context/assembler.js'
import type { Client } from '@libsql/client'

describe('ContextAssembler', () => {
  let client: Client
  let store: ObservationStore
  let assembler: ContextAssembler

  beforeEach(async () => {
    client = await createDatabase(':memory:')
    store = new ObservationStore(client)
    assembler = new ContextAssembler(store)
  })

  afterEach(() => {
    closeDatabase(client)
  })

  /**
   * Helper to add an observation with a controlled createdAt timestamp.
   * Uses raw SQL to bypass the auto-generated timestamp in addObservation.
   */
  async function seedObservation(opts: {
    agentId: string
    scope: string
    priority: 'critical' | 'important' | 'informational'
    content: string
    createdAt: string
  }): Promise<void> {
    const id = `obs-${Math.random().toString(36).slice(2, 10)}`
    await client.execute({
      sql: `INSERT INTO observations (id, agent_id, scope, priority, content, token_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, opts.agentId, opts.scope, opts.priority, opts.content, 10, opts.createdAt],
    })
  }

  describe('assembleForSupervisor', () => {
    it('includes project, strategy, and scenario observations', async () => {
      await seedObservation({
        agentId: 'supervisor',
        scope: 'project',
        priority: 'critical',
        content: 'Monorepo with 13 packages',
        createdAt: '2026-02-26T09:15:00.000Z',
      })
      await seedObservation({
        agentId: 'supervisor',
        scope: 'strategy',
        priority: 'critical',
        content: 'Investigation workers productive',
        createdAt: '2026-02-26T09:30:00.000Z',
      })
      await seedObservation({
        agentId: 'worker-1',
        scope: 'scenario:user-login',
        priority: 'important',
        content: 'Adapter pattern uses Protocol interface',
        createdAt: '2026-02-26T09:20:00.000Z',
      })

      const ctx = await assembler.assembleForSupervisor('supervisor')

      expect(ctx.observationBlock).toContain('project: Monorepo with 13 packages')
      expect(ctx.observationBlock).toContain('strategy: Investigation workers productive')
      expect(ctx.observationBlock).toContain(
        'scenario:user-login: Adapter pattern uses Protocol interface',
      )
    })

    it('excludes agent-private observations', async () => {
      await seedObservation({
        agentId: 'supervisor',
        scope: 'project',
        priority: 'critical',
        content: 'Visible',
        createdAt: '2026-02-26T09:15:00.000Z',
      })
      await seedObservation({
        agentId: 'worker-1',
        scope: 'agent:worker-1',
        priority: 'important',
        content: 'Private to worker-1',
        createdAt: '2026-02-26T09:20:00.000Z',
      })

      const ctx = await assembler.assembleForSupervisor('supervisor')

      expect(ctx.observationBlock).not.toContain('Private to worker-1')
      expect(ctx.observationBlock).not.toContain('agent:worker-1')
    })
  })

  describe('assembleForWorker', () => {
    it('includes project, own scenario, and own agent observations', async () => {
      await seedObservation({
        agentId: 'supervisor',
        scope: 'project',
        priority: 'critical',
        content: 'Monorepo info',
        createdAt: '2026-02-26T09:15:00.000Z',
      })
      await seedObservation({
        agentId: 'worker-1',
        scope: 'scenario:sc-1',
        priority: 'important',
        content: 'Scenario detail',
        createdAt: '2026-02-26T09:20:00.000Z',
      })
      await seedObservation({
        agentId: 'worker-1',
        scope: 'agent:worker-1',
        priority: 'informational',
        content: 'My private note',
        createdAt: '2026-02-26T09:25:00.000Z',
      })

      const ctx = await assembler.assembleForWorker('worker-1', 'sc-1')

      expect(ctx.observationBlock).toContain('project: Monorepo info')
      expect(ctx.observationBlock).toContain('scenario:sc-1: Scenario detail')
      expect(ctx.observationBlock).toContain('agent:worker-1: My private note')
    })

    it('excludes strategy and other agents observations', async () => {
      await seedObservation({
        agentId: 'supervisor',
        scope: 'strategy',
        priority: 'critical',
        content: 'Strategy info',
        createdAt: '2026-02-26T09:15:00.000Z',
      })
      await seedObservation({
        agentId: 'worker-2',
        scope: 'agent:worker-2',
        priority: 'important',
        content: 'Other worker private',
        createdAt: '2026-02-26T09:20:00.000Z',
      })
      await seedObservation({
        agentId: 'worker-2',
        scope: 'scenario:sc-2',
        priority: 'informational',
        content: 'Other scenario',
        createdAt: '2026-02-26T09:25:00.000Z',
      })
      // Add one that should be visible so we have something to check
      await seedObservation({
        agentId: 'supervisor',
        scope: 'project',
        priority: 'critical',
        content: 'Visible project',
        createdAt: '2026-02-26T09:10:00.000Z',
      })

      const ctx = await assembler.assembleForWorker('worker-1', 'sc-1')

      expect(ctx.observationBlock).not.toContain('Strategy info')
      expect(ctx.observationBlock).not.toContain('Other worker private')
      expect(ctx.observationBlock).not.toContain('Other scenario')
      expect(ctx.observationBlock).toContain('project: Visible project')
    })
  })

  describe('ordering', () => {
    it('observations are ordered by createdAt ASC', async () => {
      await seedObservation({
        agentId: 'supervisor',
        scope: 'project',
        priority: 'critical',
        content: 'Third',
        createdAt: '2026-02-26T09:30:00.000Z',
      })
      await seedObservation({
        agentId: 'supervisor',
        scope: 'strategy',
        priority: 'important',
        content: 'First',
        createdAt: '2026-02-26T09:10:00.000Z',
      })
      await seedObservation({
        agentId: 'worker-1',
        scope: 'scenario:sc-1',
        priority: 'informational',
        content: 'Second',
        createdAt: '2026-02-26T09:20:00.000Z',
      })

      const ctx = await assembler.assembleForSupervisor('supervisor')
      const lines = ctx.observationBlock.split('\n')

      expect(lines[0]).toContain('First')
      expect(lines[1]).toContain('Second')
      expect(lines[2]).toContain('Third')
    })
  })

  describe('formatting', () => {
    it('formats as [timestamp] [priority] scope: content', async () => {
      await seedObservation({
        agentId: 'supervisor',
        scope: 'project',
        priority: 'critical',
        content: 'Monorepo with 13 packages',
        createdAt: '2026-02-26T09:15:00.000Z',
      })

      const ctx = await assembler.assembleForSupervisor('supervisor')

      expect(ctx.observationBlock).toBe(
        '[2026-02-26 09:15] [critical] project: Monorepo with 13 packages',
      )
    })

    it('formats scenario scope correctly', async () => {
      await seedObservation({
        agentId: 'worker-1',
        scope: 'scenario:user-login',
        priority: 'important',
        content: 'Uses adapter pattern',
        createdAt: '2026-02-26T09:20:30.500Z',
      })

      const ctx = await assembler.assembleForSupervisor('supervisor')

      expect(ctx.observationBlock).toBe(
        '[2026-02-26 09:20] [important] scenario:user-login: Uses adapter pattern',
      )
    })

    it('formats agent scope correctly', async () => {
      await seedObservation({
        agentId: 'worker-1',
        scope: 'agent:worker-1',
        priority: 'informational',
        content: 'Found a useful pattern',
        createdAt: '2026-02-26T10:05:00.000Z',
      })

      const ctx = await assembler.assembleForWorker('worker-1', 'sc-1')

      expect(ctx.observationBlock).toBe(
        '[2026-02-26 10:05] [informational] agent:worker-1: Found a useful pattern',
      )
    })
  })

  describe('budget enforcement', () => {
    it('keeps most recent observations when budget is exceeded, drops oldest', async () => {
      // Each observation has tokenCount = 10 (set by seedObservation helper).
      // With a budget of 25, only 2 observations fit (20 tokens).
      // The oldest should be dropped, keeping the 2 most recent.
      const smallBudgetAssembler = new ContextAssembler(store, {
        supervisorObservationBudget: 25,
        workerObservationBudget: 25,
      })

      await seedObservation({
        agentId: 'supervisor',
        scope: 'project',
        priority: 'critical',
        content: 'Oldest observation (should be dropped)',
        createdAt: '2026-02-26T09:10:00.000Z',
      })
      await seedObservation({
        agentId: 'supervisor',
        scope: 'project',
        priority: 'important',
        content: 'Second observation',
        createdAt: '2026-02-26T09:20:00.000Z',
      })
      await seedObservation({
        agentId: 'supervisor',
        scope: 'strategy',
        priority: 'informational',
        content: 'Newest observation',
        createdAt: '2026-02-26T09:30:00.000Z',
      })

      const ctx = await smallBudgetAssembler.assembleForSupervisor('supervisor')
      const lines = ctx.observationBlock.split('\n')

      expect(lines).toHaveLength(2)
      expect(ctx.observationBlock).not.toContain('Oldest observation')
      expect(ctx.observationBlock).toContain('Second observation')
      expect(ctx.observationBlock).toContain('Newest observation')
    })

    it('preserves chronological order among kept observations', async () => {
      // Budget fits 3 of 5 observations. The 3 most recent should be kept
      // and appear in chronological order (oldest-kept first).
      const assembler3 = new ContextAssembler(store, {
        supervisorObservationBudget: 35,
      })

      for (let i = 1; i <= 5; i++) {
        await seedObservation({
          agentId: 'supervisor',
          scope: 'project',
          priority: 'critical',
          content: `Obs-${i}`,
          createdAt: `2026-02-26T09:${String(i * 10).padStart(2, '0')}:00.000Z`,
        })
      }

      const ctx = await assembler3.assembleForSupervisor('supervisor')
      const lines = ctx.observationBlock.split('\n')

      expect(lines).toHaveLength(3)
      expect(lines[0]).toContain('Obs-3')
      expect(lines[1]).toContain('Obs-4')
      expect(lines[2]).toContain('Obs-5')
    })

    it('returns all observations when total tokens fit within budget', async () => {
      // Budget of 50 easily fits 3 observations at 10 tokens each (30 total).
      const assemblerOk = new ContextAssembler(store, {
        supervisorObservationBudget: 50,
      })

      await seedObservation({
        agentId: 'supervisor',
        scope: 'project',
        priority: 'critical',
        content: 'A',
        createdAt: '2026-02-26T09:10:00.000Z',
      })
      await seedObservation({
        agentId: 'supervisor',
        scope: 'project',
        priority: 'critical',
        content: 'B',
        createdAt: '2026-02-26T09:20:00.000Z',
      })
      await seedObservation({
        agentId: 'supervisor',
        scope: 'project',
        priority: 'critical',
        content: 'C',
        createdAt: '2026-02-26T09:30:00.000Z',
      })

      const ctx = await assemblerOk.assembleForSupervisor('supervisor')
      const lines = ctx.observationBlock.split('\n')

      expect(lines).toHaveLength(3)
      expect(ctx.observationBlock).toContain('A')
      expect(ctx.observationBlock).toContain('B')
      expect(ctx.observationBlock).toContain('C')
    })

    it('returns empty string when even the newest observation exceeds budget', async () => {
      const tinyBudgetAssembler = new ContextAssembler(store, {
        supervisorObservationBudget: 5,
        workerObservationBudget: 5,
      })

      await seedObservation({
        agentId: 'supervisor',
        scope: 'project',
        priority: 'critical',
        content: 'Too large',
        createdAt: '2026-02-26T09:10:00.000Z',
      })

      const ctx = await tinyBudgetAssembler.assembleForSupervisor('supervisor')
      expect(ctx.observationBlock).toBe('')
    })

    it('enforces worker budget independently of supervisor budget', async () => {
      const mixedBudget = new ContextAssembler(store, {
        supervisorObservationBudget: 100,
        workerObservationBudget: 15, // fits only 1 observation at 10 tokens
      })

      await seedObservation({
        agentId: 'worker-1',
        scope: 'scenario:sc-1',
        priority: 'critical',
        content: 'Old worker obs',
        createdAt: '2026-02-26T09:10:00.000Z',
      })
      await seedObservation({
        agentId: 'worker-1',
        scope: 'scenario:sc-1',
        priority: 'critical',
        content: 'New worker obs',
        createdAt: '2026-02-26T09:20:00.000Z',
      })

      const ctx = await mixedBudget.assembleForWorker('worker-1', 'sc-1')
      const lines = ctx.observationBlock.split('\n')

      expect(lines).toHaveLength(1)
      expect(ctx.observationBlock).toContain('New worker obs')
      expect(ctx.observationBlock).not.toContain('Old worker obs')
    })
  })

  describe('empty store', () => {
    it('returns empty observationBlock', async () => {
      const ctx = await assembler.assembleForSupervisor('supervisor')
      expect(ctx.observationBlock).toBe('')
    })

    it('returns empty observationBlock for worker', async () => {
      const ctx = await assembler.assembleForWorker('worker-1', 'sc-1')
      expect(ctx.observationBlock).toBe('')
    })
  })

  describe('currentTask and suggestedContinuation', () => {
    it('currentTask is undefined for now', async () => {
      const ctx = await assembler.assembleForSupervisor('supervisor')
      expect(ctx.currentTask).toBeUndefined()
    })

    it('suggestedContinuation is undefined for now', async () => {
      const ctx = await assembler.assembleForWorker('worker-1', 'sc-1')
      expect(ctx.suggestedContinuation).toBeUndefined()
    })
  })
})
