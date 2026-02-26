import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createDatabase, closeDatabase } from '../../src/db/index.js'
import { ObservationStore } from '../../src/db/observation-store.js'
import { Observer, type DispatchFn, type Message } from '../../src/observe/index.js'
import { OBSERVER_SYSTEM_PROMPT, formatMessagesPrompt } from '../../src/observe/observer-prompt.js'
import type { Client } from '@libsql/client'

describe('Observer', () => {
  let client: Client
  let store: ObservationStore
  let dispatch: DispatchFn
  let observer: Observer

  beforeEach(async () => {
    client = await createDatabase(':memory:')
    store = new ObservationStore(client)
    dispatch = vi.fn()
    observer = new Observer(store, dispatch)
  })

  afterEach(() => {
    closeDatabase(client)
  })

  const sampleMessages: Message[] = [
    { role: 'user', content: 'Investigate the adapter pattern in proxy.ts', timestamp: '2026-02-26T10:00:00Z' },
    { role: 'assistant', content: 'I will read proxy.ts to understand the adapter pattern.' },
    { role: 'tool', content: 'File contents of proxy.ts: ...' },
    { role: 'assistant', content: 'The proxy uses Protocol interface as the seam between domain and implementation.' },
  ]

  describe('observe() calls dispatch correctly', () => {
    it('passes system prompt and formatted messages to dispatch', async () => {
      ;(dispatch as ReturnType<typeof vi.fn>).mockResolvedValue(
        '<observations>\n[important] Agent investigated proxy.ts\n</observations>',
      )

      await observer.observe('worker-1', 'scenario:sc-1', sampleMessages)

      expect(dispatch).toHaveBeenCalledOnce()
      const [systemPrompt, userPrompt] = (dispatch as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(systemPrompt).toBe(OBSERVER_SYSTEM_PROMPT)
      expect(userPrompt).toContain('[user] [2026-02-26T10:00:00Z]: Investigate the adapter pattern')
      expect(userPrompt).toContain('[assistant]: I will read proxy.ts')
      expect(userPrompt).toContain('[tool]: File contents of proxy.ts')
    })
  })

  describe('observation parsing', () => {
    it('parses observations with correct priority and content', async () => {
      ;(dispatch as ReturnType<typeof vi.fn>).mockResolvedValue(
        `<observations>
[critical] User confirmed scenario 'user-login' at characterized stage
[important] Found adapter pattern uses Protocol interface as seam in proxy.ts
[informational] Explored 5 files in packages/core/src/core/, no issues found
</observations>
<current-task>Investigating domain vocabulary for user-login</current-task>
<suggested-continuation>Check if assertions cover login failure path</suggested-continuation>`,
      )

      const result = await observer.observe('worker-1', 'project', sampleMessages)

      expect(result.observations).toHaveLength(3)
      expect(result.observations[0]).toEqual({
        scope: 'project',
        priority: 'critical',
        content: "User confirmed scenario 'user-login' at characterized stage",
        referencedAt: undefined,
      })
      expect(result.observations[1]).toEqual({
        scope: 'project',
        priority: 'important',
        content: 'Found adapter pattern uses Protocol interface as seam in proxy.ts',
        referencedAt: undefined,
      })
      expect(result.observations[2]).toEqual({
        scope: 'project',
        priority: 'informational',
        content: 'Explored 5 files in packages/core/src/core/, no issues found',
        referencedAt: undefined,
      })
    })

    it('extracts currentTask and suggestedContinuation', async () => {
      ;(dispatch as ReturnType<typeof vi.fn>).mockResolvedValue(
        `<observations>
[important] Agent read config files
</observations>
<current-task>Reviewing configuration</current-task>
<suggested-continuation>Validate schema against docs</suggested-continuation>`,
      )

      const result = await observer.observe('worker-1', 'project', sampleMessages)

      expect(result.currentTask).toBe('Reviewing configuration')
      expect(result.suggestedContinuation).toBe('Validate schema against docs')
    })

    it('handles missing currentTask and suggestedContinuation', async () => {
      ;(dispatch as ReturnType<typeof vi.fn>).mockResolvedValue(
        '<observations>\n[important] Agent read files\n</observations>',
      )

      const result = await observer.observe('worker-1', 'project', sampleMessages)

      expect(result.currentTask).toBeUndefined()
      expect(result.suggestedContinuation).toBeUndefined()
    })

    it('parses priority tags case-insensitively', async () => {
      ;(dispatch as ReturnType<typeof vi.fn>).mockResolvedValue(
        `<observations>
[Critical] Decision was made
[IMPORTANT] Finding was noted
[Informational] Minor detail observed
</observations>`,
      )

      const result = await observer.observe('worker-1', 'project', sampleMessages)

      expect(result.observations).toHaveLength(3)
      expect(result.observations[0].priority).toBe('critical')
      expect(result.observations[1].priority).toBe('important')
      expect(result.observations[2].priority).toBe('informational')
    })

    it('extracts referencedAt from observation content containing a date', async () => {
      ;(dispatch as ReturnType<typeof vi.fn>).mockResolvedValue(
        `<observations>
[critical] User stated deployment deadline is 2026-03-15
[important] Agent found commit from 2026-02-25T14:30:00Z with relevant changes
</observations>`,
      )

      const result = await observer.observe('worker-1', 'project', sampleMessages)

      expect(result.observations[0].referencedAt).toBe('2026-03-15')
      expect(result.observations[1].referencedAt).toBe('2026-02-25T14:30:00Z')
    })
  })

  describe('store writes', () => {
    it('writes each observation to the store with correct fields', async () => {
      ;(dispatch as ReturnType<typeof vi.fn>).mockResolvedValue(
        `<observations>
[critical] Build system uses tsup with dual ESM/CJS
[informational] Checked 3 config files
</observations>`,
      )

      await observer.observe('worker-1', 'scenario:sc-1', sampleMessages)

      const stored = await store.getObservations('scenario:sc-1')
      expect(stored).toHaveLength(2)

      expect(stored[0].agentId).toBe('worker-1')
      expect(stored[0].scope).toBe('scenario:sc-1')
      expect(stored[0].priority).toBe('critical')
      expect(stored[0].content).toBe('Build system uses tsup with dual ESM/CJS')
      expect(stored[0].tokenCount).toBeGreaterThan(0)

      expect(stored[1].agentId).toBe('worker-1')
      expect(stored[1].scope).toBe('scenario:sc-1')
      expect(stored[1].priority).toBe('informational')
      expect(stored[1].content).toBe('Checked 3 config files')
      expect(stored[1].tokenCount).toBeGreaterThan(0)
    })

    it('writes referencedAt to store when present', async () => {
      ;(dispatch as ReturnType<typeof vi.fn>).mockResolvedValue(
        '<observations>\n[critical] Deadline is 2026-04-01\n</observations>',
      )

      await observer.observe('agent-1', 'project', sampleMessages)

      const stored = await store.getObservations('project')
      expect(stored).toHaveLength(1)
      expect(stored[0].referencedAt).toBe('2026-04-01')
    })

    it('token count uses estimateTokens (chars / 4)', async () => {
      ;(dispatch as ReturnType<typeof vi.fn>).mockResolvedValue(
        '<observations>\n[important] Exactly 40 chars of content!!\n</observations>',
      )

      await observer.observe('agent-1', 'project', sampleMessages)

      const stored = await store.getObservations('project')
      expect(stored).toHaveLength(1)
      // "Exactly 40 chars of content!!" = 30 chars -> ceil(30/4) = 8
      const content = 'Exactly 40 chars of content!!'
      expect(stored[0].tokenCount).toBe(Math.ceil(content.length / 4))
    })
  })

  describe('fallback behavior', () => {
    it('malformed response (no tags) falls back to single important observation', async () => {
      ;(dispatch as ReturnType<typeof vi.fn>).mockResolvedValue(
        'The agent explored several files and found no issues.',
      )

      const result = await observer.observe('worker-1', 'project', sampleMessages)

      expect(result.observations).toHaveLength(1)
      expect(result.observations[0].priority).toBe('important')
      expect(result.observations[0].content).toBe(
        'The agent explored several files and found no issues.',
      )

      // Should also be written to store
      const stored = await store.getObservations('project')
      expect(stored).toHaveLength(1)
      expect(stored[0].priority).toBe('important')
    })

    it('observations block with no valid lines falls back to full response', async () => {
      ;(dispatch as ReturnType<typeof vi.fn>).mockResolvedValue(
        '<observations>\nno priority tags here\n</observations>',
      )

      const result = await observer.observe('worker-1', 'project', sampleMessages)

      expect(result.observations).toHaveLength(1)
      expect(result.observations[0].priority).toBe('important')
      expect(result.observations[0].content).toContain('no priority tags here')
    })
  })

  describe('edge cases', () => {
    it('empty messages array returns empty observations without calling dispatch', async () => {
      const result = await observer.observe('worker-1', 'project', [])

      expect(result.observations).toHaveLength(0)
      expect(result.currentTask).toBeUndefined()
      expect(result.suggestedContinuation).toBeUndefined()
      expect(dispatch).not.toHaveBeenCalled()
    })

    it('skips lines with invalid priority tags', async () => {
      ;(dispatch as ReturnType<typeof vi.fn>).mockResolvedValue(
        `<observations>
[critical] Valid observation
[nonsense] Invalid priority
[important] Another valid one
</observations>`,
      )

      const result = await observer.observe('worker-1', 'project', sampleMessages)

      expect(result.observations).toHaveLength(2)
      expect(result.observations[0].content).toBe('Valid observation')
      expect(result.observations[1].content).toBe('Another valid one')
    })

    it('handles empty observations block gracefully', async () => {
      ;(dispatch as ReturnType<typeof vi.fn>).mockResolvedValue(
        '<observations>\n</observations>\n<current-task>Idle</current-task>',
      )

      const result = await observer.observe('worker-1', 'project', sampleMessages)

      // Empty observations block with non-empty response -> fallback
      expect(result.observations).toHaveLength(1)
      expect(result.observations[0].priority).toBe('important')
      expect(result.currentTask).toBe('Idle')
    })
  })

  describe('formatMessagesPrompt', () => {
    it('formats messages with role and content', () => {
      const prompt = formatMessagesPrompt([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ])

      expect(prompt).toContain('[user]: Hello')
      expect(prompt).toContain('[assistant]: Hi there')
    })

    it('includes timestamp when present', () => {
      const prompt = formatMessagesPrompt([
        { role: 'user', content: 'Test', timestamp: '2026-02-26T10:00:00Z' },
      ])

      expect(prompt).toContain('[user] [2026-02-26T10:00:00Z]: Test')
    })

    it('returns "No messages" for empty array', () => {
      const prompt = formatMessagesPrompt([])
      expect(prompt).toBe('No messages to observe.')
    })
  })
})
