import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { WorkspaceOps } from '../src/operations'
import { WorkspaceStore } from '../src/storage'

describe('WorkspaceOps', () => {
  let dir: string
  let ops: WorkspaceOps

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aver-workspace-'))
    const store = new WorkspaceStore(dir, 'test-project')
    ops = new WorkspaceOps(store)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  describe('recordObservation', () => {
    it('creates an observed item and persists it', () => {
      const item = ops.recordObservation({
        behavior: 'API returns 200 for errors',
        context: 'observed on POST /orders'
      })

      expect(item.stage).toBe('observed')
      expect(item.behavior).toBe('API returns 200 for errors')

      const items = ops.getItems()
      expect(items).toHaveLength(1)
    })
  })

  describe('recordIntent', () => {
    it('creates an intended item with story', () => {
      const item = ops.recordIntent({
        behavior: 'Users can cancel pending orders',
        story: 'Cancel Order'
      })

      expect(item.stage).toBe('intended')
      expect(item.story).toBe('Cancel Order')
    })
  })

  describe('promoteItem', () => {
    it('promotes observed to explored with rationale', () => {
      const item = ops.recordObservation({ behavior: 'returns 200 for errors' })
      const promoted = ops.promoteItem(item.id, {
        rationale: 'API predates REST conventions',
        promotedBy: 'dev'
      })

      expect(promoted.stage).toBe('explored')
      expect(promoted.promotedFrom).toBe('observed')
      expect(promoted.promotedBy).toBe('dev')
    })

    it('promotes explored to intended', () => {
      const item = ops.recordObservation({ behavior: 'test' })
      ops.promoteItem(item.id, { rationale: 'explored', promotedBy: 'dev' })
      const promoted = ops.promoteItem(item.id, { rationale: 'confirmed', promotedBy: 'business' })
      expect(promoted.stage).toBe('intended')
    })

    it('promotes intended to formalized', () => {
      const item = ops.recordIntent({ behavior: 'test' })
      const promoted = ops.promoteItem(item.id, { rationale: 'tests written', promotedBy: 'testing' })
      expect(promoted.stage).toBe('formalized')
    })

    it('throws on invalid promotion (already formalized)', () => {
      const item = ops.recordIntent({ behavior: 'test' })
      ops.promoteItem(item.id, { rationale: 'done', promotedBy: 'testing' })
      expect(() => ops.promoteItem(item.id, { rationale: 'again', promotedBy: 'testing' }))
        .toThrow('Cannot promote beyond formalized')
    })

    it('throws for unknown item', () => {
      expect(() => ops.promoteItem('nonexistent', { rationale: 'x', promotedBy: 'dev' }))
        .toThrow('Item not found')
    })
  })

  describe('demoteItem', () => {
    it('demotes formalized back to explored', () => {
      const item = ops.recordIntent({ behavior: 'test' })
      ops.promoteItem(item.id, { rationale: 'done', promotedBy: 'testing' })
      const demoted = ops.demoteItem(item.id, {
        targetStage: 'explored',
        rationale: 'test started failing after system change'
      })

      expect(demoted.stage).toBe('explored')
    })

    it('throws when demoting to a later stage', () => {
      const item = ops.recordObservation({ behavior: 'test' })
      expect(() => ops.demoteItem(item.id, { targetStage: 'intended', rationale: 'x' }))
        .toThrow('Cannot demote to a later stage')
    })
  })

  describe('addQuestion / resolveQuestion', () => {
    it('adds and resolves a question on an item', () => {
      const item = ops.recordObservation({ behavior: 'test' })
      const question = ops.addQuestion(item.id, 'What happens with null input?')

      const updated = ops.getItem(item.id)!
      expect(updated.questions).toHaveLength(1)
      expect(updated.questions[0].text).toBe('What happens with null input?')
      expect(updated.questions[0].answer).toBeUndefined()

      ops.resolveQuestion(item.id, question.id, 'It throws a 400 error')
      const resolved = ops.getItem(item.id)!
      expect(resolved.questions[0].answer).toBe('It throws a 400 error')
    })
  })

  describe('getItems — filtering', () => {
    it('filters by stage', () => {
      ops.recordObservation({ behavior: 'a' })
      ops.recordObservation({ behavior: 'b' })
      ops.recordIntent({ behavior: 'c' })

      expect(ops.getItems({ stage: 'observed' })).toHaveLength(2)
      expect(ops.getItems({ stage: 'intended' })).toHaveLength(1)
    })

    it('filters by story', () => {
      ops.recordIntent({ behavior: 'a', story: 'Cancel Order' })
      ops.recordIntent({ behavior: 'b', story: 'Create Order' })

      expect(ops.getItems({ story: 'Cancel Order' })).toHaveLength(1)
    })

    it('filters by keyword in behavior', () => {
      ops.recordObservation({ behavior: 'API returns 200 for errors' })
      ops.recordObservation({ behavior: 'Database uses soft delete' })

      expect(ops.getItems({ keyword: 'error' })).toHaveLength(1)
    })
  })

  describe('linkToDomain', () => {
    it('links a formalized item to domain artifacts', () => {
      const item = ops.recordIntent({ behavior: 'test' })
      ops.promoteItem(item.id, { rationale: 'done', promotedBy: 'testing' })

      ops.linkToDomain(item.id, {
        domainOperation: 'action.cancelOrder',
        testNames: ['cancels pending order [unit]', 'cancels pending order [http]']
      })

      const linked = ops.getItem(item.id)!
      expect(linked.domainOperation).toBe('action.cancelOrder')
      expect(linked.testNames).toEqual(['cancels pending order [unit]', 'cancels pending order [http]'])
    })
  })

  describe('getSummary', () => {
    it('returns counts per stage and open questions', () => {
      ops.recordObservation({ behavior: 'a' })
      ops.recordObservation({ behavior: 'b' })
      ops.recordIntent({ behavior: 'c' })
      const item = ops.recordObservation({ behavior: 'd' })
      ops.addQuestion(item.id, 'why?')

      const summary = ops.getSummary()
      expect(summary.observed).toBe(3)
      expect(summary.intended).toBe(1)
      expect(summary.openQuestions).toBe(1)
      expect(summary.total).toBe(4)
    })
  })

  describe('getPromotionCandidates', () => {
    it('returns explored items with no open questions', () => {
      const a = ops.recordObservation({ behavior: 'a' })
      ops.promoteItem(a.id, { rationale: 'explored', promotedBy: 'dev' })

      const b = ops.recordObservation({ behavior: 'b' })
      ops.promoteItem(b.id, { rationale: 'explored', promotedBy: 'dev' })
      ops.addQuestion(b.id, 'unresolved question')

      const candidates = ops.getPromotionCandidates()
      expect(candidates).toHaveLength(1)
      expect(candidates[0].id).toBe(a.id)
    })
  })
})
