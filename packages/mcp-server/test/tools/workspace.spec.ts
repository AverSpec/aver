import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  getWorkspaceSummaryHandler,
  getWorkspaceItemsHandler,
  recordObservationHandler,
  recordIntentHandler,
  promoteItemHandler,
  demoteItemHandler,
  addQuestionHandler,
  resolveQuestionHandler,
  linkToDomainHandler,
  getWorkflowPhaseHandler,
  getPromotionCandidatesHandler,
  exportWorkspaceHandler,
  importWorkspaceHandler,
} from '../../src/tools/workspace'

describe('workspace tool handlers', () => {
  let dir: string
  const projectId = 'test'

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aver-mcp-workspace-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  describe('record_observation', () => {
    it('creates an observed item', () => {
      const result = recordObservationHandler({ behavior: 'API returns 200', context: 'POST /orders' }, dir, projectId)
      expect(result.stage).toBe('observed')
      expect(result.behavior).toBe('API returns 200')
      expect(result.context).toBe('POST /orders')
      expect(result.id).toBeDefined()
    })

    it('creates an observed item without context', () => {
      const result = recordObservationHandler({ behavior: 'items display in list' }, dir, projectId)
      expect(result.stage).toBe('observed')
      expect(result.behavior).toBe('items display in list')
    })
  })

  describe('record_intent', () => {
    it('creates an intended item', () => {
      const result = recordIntentHandler({ behavior: 'user can add to cart', story: 'checkout flow' }, dir, projectId)
      expect(result.stage).toBe('intended')
      expect(result.behavior).toBe('user can add to cart')
      expect(result.story).toBe('checkout flow')
    })

    it('creates an intended item without story', () => {
      const result = recordIntentHandler({ behavior: 'validation rejects empty name' }, dir, projectId)
      expect(result.stage).toBe('intended')
      expect(result.behavior).toBe('validation rejects empty name')
    })
  })

  describe('get_workspace_summary', () => {
    it('returns counts per stage', () => {
      recordObservationHandler({ behavior: 'a' }, dir, projectId)
      recordObservationHandler({ behavior: 'b' }, dir, projectId)
      recordIntentHandler({ behavior: 'c' }, dir, projectId)

      const summary = getWorkspaceSummaryHandler(dir, projectId)
      expect(summary.observed).toBe(2)
      expect(summary.intended).toBe(1)
      expect(summary.explored).toBe(0)
      expect(summary.formalized).toBe(0)
      expect(summary.total).toBe(3)
      expect(summary.openQuestions).toBe(0)
    })

    it('returns zeros for empty workspace', () => {
      const summary = getWorkspaceSummaryHandler(dir, projectId)
      expect(summary.total).toBe(0)
    })
  })

  describe('get_workspace_items', () => {
    it('returns all items when no filter', () => {
      recordObservationHandler({ behavior: 'a' }, dir, projectId)
      recordIntentHandler({ behavior: 'b' }, dir, projectId)

      const items = getWorkspaceItemsHandler({}, dir, projectId)
      expect(items).toHaveLength(2)
    })

    it('filters by stage', () => {
      recordObservationHandler({ behavior: 'a' }, dir, projectId)
      recordIntentHandler({ behavior: 'b' }, dir, projectId)

      const items = getWorkspaceItemsHandler({ stage: 'observed' }, dir, projectId)
      expect(items).toHaveLength(1)
      expect(items[0].behavior).toBe('a')
    })

    it('filters by keyword', () => {
      recordObservationHandler({ behavior: 'API returns 200' }, dir, projectId)
      recordObservationHandler({ behavior: 'page loads' }, dir, projectId)

      const items = getWorkspaceItemsHandler({ keyword: 'API' }, dir, projectId)
      expect(items).toHaveLength(1)
      expect(items[0].behavior).toBe('API returns 200')
    })
  })

  describe('promote_item', () => {
    it('promotes observed to explored', () => {
      const item = recordObservationHandler({ behavior: 'a' }, dir, projectId)
      const promoted = promoteItemHandler({ id: item.id, rationale: 'investigated', promotedBy: 'dev' }, dir, projectId)
      expect(promoted.stage).toBe('explored')
    })

    it('promotes explored to intended', () => {
      const item = recordObservationHandler({ behavior: 'a' }, dir, projectId)
      promoteItemHandler({ id: item.id, rationale: 'step 1', promotedBy: 'dev' }, dir, projectId)
      const promoted = promoteItemHandler({ id: item.id, rationale: 'step 2', promotedBy: 'dev' }, dir, projectId)
      expect(promoted.stage).toBe('intended')
    })

    it('throws for unknown item', () => {
      expect(() => {
        promoteItemHandler({ id: 'nonexistent', rationale: 'test', promotedBy: 'dev' }, dir, projectId)
      }).toThrow('Item not found')
    })
  })

  describe('demote_item', () => {
    it('demotes explored back to observed', () => {
      const item = recordObservationHandler({ behavior: 'a' }, dir, projectId)
      promoteItemHandler({ id: item.id, rationale: 'promote', promotedBy: 'dev' }, dir, projectId)
      const demoted = demoteItemHandler({ id: item.id, targetStage: 'observed', rationale: 'rethinking' }, dir, projectId)
      expect(demoted.stage).toBe('observed')
    })

    it('throws for unknown item', () => {
      expect(() => {
        demoteItemHandler({ id: 'nonexistent', targetStage: 'observed', rationale: 'test' }, dir, projectId)
      }).toThrow('Item not found')
    })
  })

  describe('add_question', () => {
    it('adds a question to an item', () => {
      const item = recordObservationHandler({ behavior: 'a' }, dir, projectId)
      const question = addQuestionHandler({ itemId: item.id, text: 'What triggers this?' }, dir, projectId)
      expect(question.id).toBeDefined()
      expect(question.text).toBe('What triggers this?')
    })

    it('question appears in summary as open', () => {
      const item = recordObservationHandler({ behavior: 'a' }, dir, projectId)
      addQuestionHandler({ itemId: item.id, text: 'Why?' }, dir, projectId)
      const summary = getWorkspaceSummaryHandler(dir, projectId)
      expect(summary.openQuestions).toBe(1)
    })
  })

  describe('resolve_question', () => {
    it('resolves an open question', () => {
      const item = recordObservationHandler({ behavior: 'a' }, dir, projectId)
      const question = addQuestionHandler({ itemId: item.id, text: 'Why?' }, dir, projectId)
      resolveQuestionHandler({ itemId: item.id, questionId: question.id, answer: 'Because reasons' }, dir, projectId)

      const summary = getWorkspaceSummaryHandler(dir, projectId)
      expect(summary.openQuestions).toBe(0)
    })
  })

  describe('link_to_domain', () => {
    it('links an item to domain artifacts', () => {
      const item = recordObservationHandler({ behavior: 'a' }, dir, projectId)
      linkToDomainHandler(
        { itemId: item.id, domainOperation: 'Cart.addItem', testNames: ['adds item to cart'] },
        dir,
        projectId,
      )

      const items = getWorkspaceItemsHandler({}, dir, projectId)
      expect(items[0].domainOperation).toBe('Cart.addItem')
      expect(items[0].testNames).toEqual(['adds item to cart'])
    })
  })

  describe('get_workflow_phase', () => {
    it('returns kickoff for empty workspace', () => {
      const phase = getWorkflowPhaseHandler(dir, projectId)
      expect(phase.name).toBe('kickoff')
    })

    it('returns discovery after observations', () => {
      recordObservationHandler({ behavior: 'a' }, dir, projectId)
      const phase = getWorkflowPhaseHandler(dir, projectId)
      expect(phase.name).toBe('discovery')
    })

    it('returns formalization after intents', () => {
      recordIntentHandler({ behavior: 'a' }, dir, projectId)
      const phase = getWorkflowPhaseHandler(dir, projectId)
      expect(phase.name).toBe('formalization')
    })
  })

  describe('get_promotion_candidates', () => {
    it('returns items eligible for promotion', () => {
      recordObservationHandler({ behavior: 'a' }, dir, projectId)
      recordObservationHandler({ behavior: 'b' }, dir, projectId)

      const candidates = getPromotionCandidatesHandler(dir, projectId)
      expect(candidates).toHaveLength(2)
    })

    it('excludes items with open questions', () => {
      const item = recordObservationHandler({ behavior: 'a' }, dir, projectId)
      addQuestionHandler({ itemId: item.id, text: 'unclear' }, dir, projectId)
      recordObservationHandler({ behavior: 'b' }, dir, projectId)

      const candidates = getPromotionCandidatesHandler(dir, projectId)
      expect(candidates).toHaveLength(1)
      expect(candidates[0].behavior).toBe('b')
    })
  })

  describe('export_workspace', () => {
    it('exports as markdown', () => {
      recordObservationHandler({ behavior: 'test item' }, dir, projectId)
      const result = exportWorkspaceHandler({ format: 'markdown' }, dir, projectId)
      expect(result).toContain('test item')
      expect(result).toContain('# Workspace Summary')
    })

    it('exports as json', () => {
      recordObservationHandler({ behavior: 'test item' }, dir, projectId)
      const result = exportWorkspaceHandler({ format: 'json' }, dir, projectId)
      const parsed = JSON.parse(result)
      expect(parsed.items).toHaveLength(1)
      expect(parsed.items[0].behavior).toBe('test item')
    })
  })

  describe('import_workspace', () => {
    it('imports items from json', () => {
      // Create a source workspace with items
      const sourceItem = recordObservationHandler({ behavior: 'from source' }, dir, projectId)
      const exported = exportWorkspaceHandler({ format: 'json' }, dir, projectId)

      // Create a different target workspace
      const targetDir = mkdtempSync(join(tmpdir(), 'aver-mcp-workspace-target-'))
      try {
        const result = importWorkspaceHandler({ json: exported }, targetDir, projectId)
        expect(result.added).toBe(1)
        expect(result.skipped).toBe(0)

        // Verify the imported items
        const items = getWorkspaceItemsHandler({}, targetDir, projectId)
        expect(items).toHaveLength(1)
        expect(items[0].behavior).toBe('from source')
      } finally {
        rmSync(targetDir, { recursive: true, force: true })
      }
    })

    it('skips duplicate items on import', () => {
      recordObservationHandler({ behavior: 'existing' }, dir, projectId)
      const exported = exportWorkspaceHandler({ format: 'json' }, dir, projectId)

      // Import back into same workspace (duplicate IDs)
      const result = importWorkspaceHandler({ json: exported }, dir, projectId)
      expect(result.added).toBe(0)
      expect(result.skipped).toBe(1)
    })
  })
})
