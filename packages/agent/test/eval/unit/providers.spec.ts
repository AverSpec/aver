import { describe, it, expect, vi } from 'vitest'
import { agentSdkProvider } from '../../../src/eval/providers/agent-sdk'

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}))

import { query } from '@anthropic-ai/claude-agent-sdk'

const mockQuery = vi.mocked(query)

function asyncIterable<T>(...items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0
      return {
        async next() {
          if (i < items.length) return { value: items[i++], done: false }
          return { value: undefined as any, done: true }
        },
      }
    },
  }
}

describe('agentSdkProvider', () => {
  it('returns an object with a judge method', () => {
    const provider = agentSdkProvider()
    expect(typeof provider.judge).toBe('function')
  })

  it('accepts a model option', () => {
    const provider = agentSdkProvider({ model: 'claude-haiku-4-5-20251001' })
    expect(typeof provider.judge).toBe('function')
  })

  describe('judge() behavioral tests', () => {
    it('returns parsed verdict on success', async () => {
      mockQuery.mockReturnValue(
        asyncIterable({
          type: 'result',
          subtype: 'success',
          structured_output: { pass: true, reasoning: 'Meets all criteria.', confidence: 'high' },
        }) as any,
      )

      const provider = agentSdkProvider()
      const verdict = await provider.judge('some content', 'some rubric')

      expect(verdict).toEqual({ pass: true, reasoning: 'Meets all criteria.', confidence: 'high' })
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            model: 'claude-haiku-4-5-20251001',
            maxTurns: 4,
          }),
        }),
      )
    })

    it('throws on max structured output retries', async () => {
      mockQuery.mockReturnValue(
        asyncIterable({
          type: 'result',
          subtype: 'error_max_structured_output_retries',
        }) as any,
      )

      const provider = agentSdkProvider()
      await expect(provider.judge('content', 'rubric')).rejects.toThrow(
        'Judge failed to produce structured output after max retries',
      )
    })

    it('throws on general error with error details', async () => {
      mockQuery.mockReturnValue(
        asyncIterable({
          type: 'result',
          subtype: 'error',
          is_error: true,
          errors: ['API rate limited', 'Model unavailable'],
        }) as any,
      )

      const provider = agentSdkProvider()
      await expect(provider.judge('content', 'rubric')).rejects.toThrow(
        'Judge dispatch failed: API rate limited, Model unavailable',
      )
    })

    it('throws on general error with unknown error when no errors array', async () => {
      mockQuery.mockReturnValue(
        asyncIterable({
          type: 'result',
          subtype: 'error',
          is_error: true,
        }) as any,
      )

      const provider = agentSdkProvider()
      await expect(provider.judge('content', 'rubric')).rejects.toThrow(
        'Judge dispatch failed: unknown error',
      )
    })

    it('throws when no structured output is returned', async () => {
      mockQuery.mockReturnValue(
        asyncIterable({
          type: 'result',
          subtype: 'success',
          // no structured_output field
        }) as any,
      )

      const provider = agentSdkProvider()
      await expect(provider.judge('content', 'rubric')).rejects.toThrow(
        'Judge returned no structured output',
      )
    })

    it('validates structured output against VerdictSchema', async () => {
      mockQuery.mockReturnValue(
        asyncIterable({
          type: 'result',
          subtype: 'success',
          structured_output: { pass: true, reasoning: '', confidence: 'high' }, // empty reasoning should fail
        }) as any,
      )

      const provider = agentSdkProvider()
      await expect(provider.judge('content', 'rubric')).rejects.toThrow()
    })

    it('uses custom model when provided', async () => {
      mockQuery.mockReturnValue(
        asyncIterable({
          type: 'result',
          subtype: 'success',
          structured_output: { pass: false, reasoning: 'Does not meet criteria.', confidence: 'medium' },
        }) as any,
      )

      const provider = agentSdkProvider({ model: 'claude-sonnet-4-5-20250929' })
      await provider.judge('content', 'rubric')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            model: 'claude-sonnet-4-5-20250929',
          }),
        }),
      )
    })

    it('returns confidence when present in structured output', async () => {
      mockQuery.mockReturnValue(
        asyncIterable({
          type: 'result',
          subtype: 'success',
          structured_output: { pass: true, reasoning: 'Meets criteria.', confidence: 'high' },
        }) as any,
      )

      const provider = agentSdkProvider()
      const verdict = await provider.judge('content', 'rubric')
      expect(verdict.confidence).toBe('high')
    })

    it('rejects verdict without confidence', async () => {
      mockQuery.mockReturnValue(
        asyncIterable({
          type: 'result',
          subtype: 'success',
          structured_output: { pass: true, reasoning: 'Meets criteria.' },
        }) as any,
      )

      const provider = agentSdkProvider()
      await expect(provider.judge('content', 'rubric')).rejects.toThrow()
    })
  })
})
