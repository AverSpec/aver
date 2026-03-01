import { LexoRank } from 'lexorank'
import {
  createBacklogItem,
  type BacklogItem,
  type BacklogFilter,
  type BacklogSummary,
  type BacklogMoveTarget,
  type BacklogItemUpdateInput,
  type BacklogPriority,
  type BacklogItemReference,
  type BacklogItemType,
} from './backlog-types.js'
import type { WorkspaceStore } from './storage.js'

const PRIORITY_ORDER: BacklogPriority[] = ['P0', 'P1', 'P2', 'P3']

function sortItems(items: BacklogItem[]): BacklogItem[] {
  return [...items].sort((a, b) => {
    const pa = PRIORITY_ORDER.indexOf(a.priority)
    const pb = PRIORITY_ORDER.indexOf(b.priority)
    if (pa !== pb) return pa - pb
    return a.rank.localeCompare(b.rank)
  })
}

export class BacklogOps {
  constructor(private readonly store: WorkspaceStore) {}

  async createItem(input: {
    title: string
    description?: string
    priority?: BacklogPriority
    type?: BacklogItemType
    tags?: string[]
    references?: BacklogItemReference[]
    externalUrl?: string
    scenarioIds?: string[]
  }): Promise<BacklogItem> {
    const priority = input.priority ?? 'P1'
    const items = await this.store.loadBacklogItems()

    // Find last item in the same priority tier to append after
    const tierItems = items.filter(i => i.priority === priority).sort((a, b) => a.rank.localeCompare(b.rank))
    const rank = tierItems.length > 0
      ? LexoRank.parse(tierItems[tierItems.length - 1].rank).genNext().toString()
      : LexoRank.middle().toString()

    const item = createBacklogItem({ ...input, priority, rank })

    await this.store.mutateBacklog(existing => [...existing, item])
    return item
  }

  async updateItem(id: string, updates: BacklogItemUpdateInput): Promise<BacklogItem> {
    let found: BacklogItem | undefined
    await this.store.mutateBacklog(items => {
      return items.map(item => {
        if (item.id !== id) return item
        found = { ...item, ...updates, updatedAt: new Date().toISOString() }
        return found
      })
    })
    if (!found) throw new Error(`Backlog item "${id}" not found`)
    return found
  }

  async deleteItem(id: string): Promise<void> {
    let deleted = false
    await this.store.mutateBacklog(items => {
      const filtered = items.filter(i => i.id !== id)
      deleted = filtered.length < items.length
      return filtered
    })
    if (!deleted) throw new Error(`Backlog item "${id}" not found`)
  }

  async getItem(id: string): Promise<BacklogItem | undefined> {
    const items = await this.store.loadBacklogItems()
    return items.find(i => i.id === id)
  }

  async getItems(filter?: BacklogFilter): Promise<BacklogItem[]> {
    const items = await this.store.loadBacklogItems()
    let filtered = items
    if (filter?.status) filtered = filtered.filter(i => i.status === filter.status)
    if (filter?.priority) filtered = filtered.filter(i => i.priority === filter.priority)
    if (filter?.type) filtered = filtered.filter(i => i.type === filter.type)
    if (filter?.tag) filtered = filtered.filter(i => i.tags?.includes(filter.tag!))
    return sortItems(filtered)
  }

  async getSummary(): Promise<BacklogSummary> {
    const items = await this.store.loadBacklogItems()
    const activeItems = items.filter(i => i.status === 'open' || i.status === 'in-progress')
    return {
      open: items.filter(i => i.status === 'open').length,
      'in-progress': items.filter(i => i.status === 'in-progress').length,
      done: items.filter(i => i.status === 'done').length,
      dismissed: items.filter(i => i.status === 'dismissed').length,
      total: items.length,
      byPriority: {
        P0: activeItems.filter(i => i.priority === 'P0').length,
        P1: activeItems.filter(i => i.priority === 'P1').length,
        P2: activeItems.filter(i => i.priority === 'P2').length,
        P3: activeItems.filter(i => i.priority === 'P3').length,
      },
    }
  }

  async moveItem(id: string, target: BacklogMoveTarget): Promise<BacklogItem> {
    let found: BacklogItem | undefined
    await this.store.mutateBacklog(items => {
      const idx = items.findIndex(i => i.id === id)
      if (idx === -1) return items
      const item = { ...items[idx] }

      // Update priority if specified
      if (target.priority) item.priority = target.priority

      const tierItems = items
        .filter(i => i.priority === item.priority && i.id !== id)
        .sort((a, b) => a.rank.localeCompare(b.rank))

      if (target.after) {
        const afterItem = tierItems.find(i => i.id === target.after)
        if (!afterItem) {
          const inOtherTier = items.find(i => i.id === target.after && i.id !== id)
          if (inOtherTier) {
            throw new Error(
              `Item "${target.after}" exists but is in the ${inOtherTier.priority} tier. ` +
              `Use the priority parameter to move across tiers, or specify an item within the same tier.`
            )
          }
          throw new Error(`Backlog item "${target.after}" not found`)
        }
        const afterIdx = tierItems.indexOf(afterItem)
        const afterRank = LexoRank.parse(afterItem.rank)
        const nextItem = tierItems[afterIdx + 1]
        item.rank = nextItem
          ? afterRank.between(LexoRank.parse(nextItem.rank)).toString()
          : afterRank.genNext().toString()
      } else if (target.before) {
        const beforeItem = tierItems.find(i => i.id === target.before)
        if (!beforeItem) {
          const inOtherTier = items.find(i => i.id === target.before && i.id !== id)
          if (inOtherTier) {
            throw new Error(
              `Item "${target.before}" exists but is in the ${inOtherTier.priority} tier. ` +
              `Use the priority parameter to move across tiers, or specify an item within the same tier.`
            )
          }
          throw new Error(`Backlog item "${target.before}" not found`)
        }
        const beforeIdx = tierItems.indexOf(beforeItem)
        const beforeRank = LexoRank.parse(beforeItem.rank)
        const prevItem = tierItems[beforeIdx - 1]
        item.rank = prevItem
          ? LexoRank.parse(prevItem.rank).between(beforeRank).toString()
          : beforeRank.genPrev().toString()
      } else {
        // No position specified — append to end of tier
        const lastRank = tierItems.length > 0
          ? LexoRank.parse(tierItems[tierItems.length - 1].rank)
          : LexoRank.middle()
        item.rank = tierItems.length > 0 ? lastRank.genNext().toString() : lastRank.toString()
      }

      item.updatedAt = new Date().toISOString()
      found = item
      return items.map(i => i.id === id ? item : i)
    })
    if (!found) throw new Error(`Backlog item "${id}" not found`)
    return found
  }
}
