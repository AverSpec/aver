import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDatabase, closeDatabase } from '../../src/db/index.js'
import { ObservationStore } from '../../src/db/observation-store.js'
import { estimateTokens } from '../../src/db/tokens.js'
import { Reflector } from '../../src/observe/reflector.js'
import { REFLECTOR_SYSTEM_PROMPT } from '../../src/observe/reflector-prompt.js'
import type { Client } from '@libsql/client'
import type { DispatchFn } from '../../src/observe/reflector.js'

/** Helper: seed N observations with roughly `tokensEach` tokens each. */
async function seedObservations(
  store: ObservationStore,
  scope: string,
  count: number,
  priority: 'critical' | 'important' | 'informational' = 'important',
  contentPrefix = 'Observation',
): Promise<void> {
  for (let i = 0; i < count; i++) {
    // Each observation is ~contentPrefix + index text
    const content = `${contentPrefix} number ${i}: ${'x'.repeat(80)}`
    await store.addObservation({
      agentId: 'agent-1',
      scope,
      priority,
      content,
      tokenCount: estimateTokens(`[${priority}] ${content}`),
    })
  }
}

/**
 * Build a mock dispatch that returns compressed observations.
 * `factor` controls how much compression: 0.5 = half the lines.
 */
function mockDispatch(factor: number, degenerate = false): DispatchFn {
  return async (_system: string, user: string) => {
    // Extract observations from the user prompt
    const match = user.match(/<observations>([\s\S]*?)<\/observations>/)
    if (!match) return '<observations></observations>'

    const lines = match[1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    // Keep factor proportion of lines
    const keepCount = Math.max(1, Math.floor(lines.length * factor))
    const kept = lines.slice(0, keepCount)

    const degTag = degenerate ? '\n<degenerate>true</degenerate>' : ''
    return `<observations>\n${kept.join('\n')}\n</observations>${degTag}`
  }
}

/**
 * Build a level-aware mock that applies different factors per level.
 */
function levelAwareDispatch(factors: Record<number, number>): DispatchFn {
  let callCount = 0
  return async (system: string, user: string) => {
    const level = callCount
    callCount++
    const factor = factors[level] ?? 0.3
    return mockDispatch(factor)(system, user)
  }
}

/**
 * Mock dispatch that always returns same-size output (compression fails).
 */
function noCompressionDispatch(): DispatchFn {
  return async (_system: string, user: string) => {
    // Return the observations unchanged
    const match = user.match(/<observations>([\s\S]*?)<\/observations>/)
    if (!match) return '<observations></observations>'
    return `<observations>${match[1]}</observations>`
  }
}

describe('Reflector', () => {
  let client: Client
  let store: ObservationStore

  beforeEach(async () => {
    client = await createDatabase(':memory:')
    store = new ObservationStore(client)
  })

  afterEach(() => {
    closeDatabase(client)
  })

  it('returns early if observations are under threshold (no LLM call)', async () => {
    let dispatched = false
    const dispatch: DispatchFn = async () => {
      dispatched = true
      return ''
    }

    await store.addObservation({
      agentId: 'agent-1',
      scope: 'project',
      priority: 'critical',
      content: 'Small observation',
      tokenCount: 10,
    })

    const reflector = new Reflector(store, dispatch, { threshold: 100 })
    const result = await reflector.reflect('project')

    expect(dispatched).toBe(false)
    expect(result.level).toBe(-1)
    expect(result.inputTokens).toBe(10)
    expect(result.outputTokens).toBe(10)
    expect(result.degenerate).toBe(false)
  })

  it('level 0: reorganizes observations, validates output is smaller', async () => {
    // Seed enough to exceed threshold
    await seedObservations(store, 'project', 50)
    const tokensBefore = await store.getTokenCount('project')
    expect(tokensBefore).toBeGreaterThan(100)

    const reflector = new Reflector(store, mockDispatch(0.5), { threshold: 100 })
    const result = await reflector.reflect('project')

    expect(result.level).toBe(0)
    expect(result.outputTokens).toBeLessThan(result.inputTokens)
    expect(result.degenerate).toBe(false)
  })

  it('escalates from level 0 to level 1 if level 0 does not reduce enough', async () => {
    await seedObservations(store, 'project', 50)
    const tokensBefore = await store.getTokenCount('project')

    // Level 0: only slight reduction (0.9), still over threshold
    // Level 1: bigger reduction (0.3), under threshold
    const dispatch = levelAwareDispatch({ 0: 0.9, 1: 0.3 })
    const reflector = new Reflector(store, dispatch, { threshold: 100 })
    const result = await reflector.reflect('project')

    expect(result.level).toBe(1)
    expect(result.outputTokens).toBeLessThan(tokensBefore)
  })

  it('full escalation path: 0 -> 1 -> 2 -> 3', async () => {
    await seedObservations(store, 'project', 50)

    // Each level barely reduces — only level 3 gets under threshold
    const dispatch = levelAwareDispatch({ 0: 0.95, 1: 0.9, 2: 0.85, 3: 0.1 })
    const reflector = new Reflector(store, dispatch, { threshold: 100 })
    const result = await reflector.reflect('project')

    expect(result.level).toBe(3)
    expect(result.outputTokens).toBeLessThan(result.inputTokens)
  })

  it('old observations marked as superseded after successful compression', async () => {
    await seedObservations(store, 'project', 10)
    const before = await store.getObservations('project')
    expect(before).toHaveLength(10)
    expect(before.every((o) => o.supersededBy === undefined)).toBe(true)

    const reflector = new Reflector(store, mockDispatch(0.3), { threshold: 100 })
    await reflector.reflect('project')

    // Old observations should now be superseded
    for (const old of before) {
      const updated = await store.getObservation(old.id)
      expect(updated!.supersededBy).toBeDefined()
    }

    // Active observations should be the compressed set
    const after = await store.getObservations('project')
    expect(after.length).toBeLessThan(before.length)
    expect(after.every((o) => o.supersededBy === undefined)).toBe(true)
  })

  it('new compressed observations written to store with correct scope', async () => {
    await seedObservations(store, 'strategy', 10)

    const reflector = new Reflector(store, mockDispatch(0.3), { threshold: 100 })
    await reflector.reflect('strategy')

    const active = await store.getObservations('strategy')
    expect(active.length).toBeGreaterThan(0)
    expect(active.every((o) => o.scope === 'strategy')).toBe(true)
  })

  it('priority-aware: critical observations survive through compression', async () => {
    // Add critical observations
    for (let i = 0; i < 5; i++) {
      const content = `Critical finding ${i}: ${'y'.repeat(80)}`
      await store.addObservation({
        agentId: 'agent-1',
        scope: 'project',
        priority: 'critical',
        content,
        tokenCount: estimateTokens(`[critical] ${content}`),
      })
    }
    // Add informational padding
    await seedObservations(store, 'project', 20, 'informational', 'Padding')

    // Mock that keeps all critical lines, drops informational
    const dispatch: DispatchFn = async (_system, user) => {
      const match = user.match(/<observations>([\s\S]*?)<\/observations>/)
      if (!match) return '<observations></observations>'
      const lines = match[1]
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
      const criticalLines = lines.filter((l) => l.startsWith('[critical]'))
      return `<observations>\n${criticalLines.join('\n')}\n</observations>`
    }

    const reflector = new Reflector(store, dispatch, { threshold: 100 })
    const result = await reflector.reflect('project')

    const active = await store.getObservations('project')
    expect(active.every((o) => o.priority === 'critical')).toBe(true)
    expect(active.length).toBe(5)
  })

  it('returns correct metadata: level used, input/output tokens, degenerate flag', async () => {
    await seedObservations(store, 'project', 20)
    const tokensBefore = await store.getTokenCount('project')

    const reflector = new Reflector(store, mockDispatch(0.3), { threshold: 100 })
    const result = await reflector.reflect('project')

    expect(result.inputTokens).toBe(tokensBefore)
    expect(result.outputTokens).toBeLessThan(result.inputTokens)
    expect(result.outputTokens).toBeGreaterThan(0)
    expect(result.level).toBeGreaterThanOrEqual(0)
    expect(result.level).toBeLessThanOrEqual(3)
    expect(result.degenerate).toBe(false)
  })

  it('degenerate detection: sets result.degenerate when LLM flags it', async () => {
    await seedObservations(store, 'project', 20)

    const reflector = new Reflector(store, mockDispatch(0.3, true), { threshold: 100 })
    const result = await reflector.reflect('project')

    expect(result.degenerate).toBe(true)
  })

  it('handles compression failure at all levels gracefully', async () => {
    await seedObservations(store, 'project', 20)
    const tokensBefore = await store.getTokenCount('project')

    const reflector = new Reflector(store, noCompressionDispatch(), { threshold: 100 })
    const result = await reflector.reflect('project')

    // Should report level 3 (max) and output = input (no compression achieved)
    expect(result.level).toBe(3)
    expect(result.outputTokens).toBe(tokensBefore)
    expect(result.degenerate).toBe(false)

    // Old observations should NOT be superseded since compression failed
    const active = await store.getObservations('project')
    expect(active).toHaveLength(20)
  })

  it('returns early with level -1 for empty scope', async () => {
    const dispatch: DispatchFn = async () => {
      throw new Error('should not be called')
    }
    const reflector = new Reflector(store, dispatch, { threshold: 100 })
    const result = await reflector.reflect('nonexistent')

    expect(result.level).toBe(-1)
    expect(result.inputTokens).toBe(0)
    expect(result.outputTokens).toBe(0)
  })

  it('uses REFLECTOR_SYSTEM_PROMPT when dispatching', async () => {
    await seedObservations(store, 'project', 10)
    let capturedSystem = ''

    const dispatch: DispatchFn = async (system, user) => {
      capturedSystem = system
      return mockDispatch(0.3)(system, user)
    }

    const reflector = new Reflector(store, dispatch, { threshold: 100 })
    await reflector.reflect('project')

    expect(capturedSystem).toBe(REFLECTOR_SYSTEM_PROMPT)
  })
})
