import { describe, expect } from 'vitest'
import { suite } from '@aver/core'
import { backlogManagement } from './domains/backlog-management'
import { backlogManagementAdapter } from './adapters/backlog-management.unit'

describe('Backlog Management', () => {
  const { test } = suite(backlogManagement, backlogManagementAdapter)

  // --- Item Lifecycle ---

  describe('item lifecycle', () => {
    test('creating an item defaults to open status and P1 priority', async ({ given, when, then }) => {
      await when.createItem({ title: 'New feature idea' })
      await then.itemExists({ title: 'New feature idea' })
      await then.itemIsAt({ status: 'open' })
      await then.itemHasPriority({ priority: 'P1' })
    })

    test('creating an item with explicit priority', async ({ when, then }) => {
      await when.createItem({ title: 'Critical bug', priority: 'P0', type: 'bug' })
      await then.itemExists({ title: 'Critical bug' })
      await then.itemHasPriority({ priority: 'P0' })
    })

    test('updating item status to in-progress', async ({ given, when, then }) => {
      await given.createItem({ title: 'Work in progress' })
      await when.updateItem({ status: 'in-progress' })
      await then.itemIsAt({ status: 'in-progress' })
    })

    test('dismissing an item', async ({ given, when, then }) => {
      await given.createItem({ title: 'Not needed anymore' })
      await when.updateItem({ status: 'dismissed' })
      await then.itemIsAt({ status: 'dismissed' })
    })

    test('deleting an item removes it entirely', async ({ given, when, then }) => {
      await given.createItem({ title: 'Temporary' })
      await when.deleteItem()
      await then.itemDeleted()
    })
  })

  // --- Priority and Ranking ---

  describe('priority and ranking', () => {
    test('items are ordered by creation within a tier', async ({ given, then, query }) => {
      await given.createItem({ title: 'First', priority: 'P1' })
      await given.createItem({ title: 'Second', priority: 'P1' })
      await given.createItem({ title: 'Third', priority: 'P1' })
      const order = await query.itemOrder({ priority: 'P1' })
      expect(order).toEqual(['First', 'Second', 'Third'])
    })

    test('higher priority items appear before lower priority', async ({ given, then, query }) => {
      await given.createItem({ title: 'Low priority', priority: 'P2' })
      await given.createItem({ title: 'High priority', priority: 'P0' })
      await given.createItem({ title: 'Medium priority', priority: 'P1' })
      const order = await query.itemOrder({})
      expect(order).toEqual(['High priority', 'Medium priority', 'Low priority'])
    })

    test('moving an item to a different priority tier', async ({ given, when, then }) => {
      await given.createItem({ title: 'Escalate me', priority: 'P2' })
      await when.moveItem({ priority: 'P0' })
      await then.itemHasPriority({ priority: 'P0' })
    })

    test('reordering within a priority tier', async ({ given, when, then }) => {
      await given.createItem({ title: 'First', priority: 'P1' })
      await given.createItem({ title: 'Second', priority: 'P1' })
      await given.createItem({ title: 'Third', priority: 'P1' })
      // Third is current. Move it after First.
      await when.moveItem({ after: 'First' })
      // Now select Third and verify it's before Second
      await given.selectItem({ title: 'Third' })
      await then.itemRankedBefore({ other: 'Second' })
    })
  })

  // --- References ---

  describe('references', () => {
    test('adding a reference to an item', async ({ given, when, then }) => {
      await given.createItem({ title: 'Design doc needed' })
      await when.addReference({ label: 'Design doc', path: 'docs/design.md' })
      await then.itemHasReference({ label: 'Design doc', path: 'docs/design.md' })
    })

    test('linking a scenario to an item', async ({ given, when, then, query }) => {
      await given.createItem({ title: 'Tracked by scenario' })
      await when.linkScenario({ scenarioId: 'abc123' })
      // Verify item still exists and the operation succeeded (no error)
      await then.itemExists({ title: 'Tracked by scenario' })
    })
  })

  // --- Queries ---

  describe('queries', () => {
    test('counting items by status', async ({ given, when, query }) => {
      await given.createItem({ title: 'Open item' })
      await given.createItem({ title: 'Another open' })
      await given.createItem({ title: 'Will close' })
      await given.selectItem({ title: 'Will close' })
      await when.updateItem({ status: 'done' })
      const openCount = await query.itemCount({ status: 'open' })
      expect(openCount).toBe(2)
      const doneCount = await query.itemCount({ status: 'done' })
      expect(doneCount).toBe(1)
    })

    test('counting items by priority', async ({ given, query }) => {
      await given.createItem({ title: 'Critical', priority: 'P0' })
      await given.createItem({ title: 'Normal', priority: 'P1' })
      await given.createItem({ title: 'Also normal', priority: 'P1' })
      const p0Count = await query.itemCount({ priority: 'P0' })
      expect(p0Count).toBe(1)
      const p1Count = await query.itemCount({ priority: 'P1' })
      expect(p1Count).toBe(2)
    })
  })
})
