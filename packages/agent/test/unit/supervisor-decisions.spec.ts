import { describe, it, expect } from 'vitest'
import { parseDecision, DecisionParseError } from '../../src/supervisor/decisions.js'

describe('parseDecision', () => {
  it('parses dispatch_worker action', () => {
    const json = JSON.stringify({
      action: {
        type: 'dispatch_worker',
        worker: {
          goal: 'investigate auth',
          artifacts: ['inv-auth'],
          skill: 'investigation',
          allowUserQuestions: true,
          permissionLevel: 'read_only',
        },
      },
      messageToUser: 'Starting investigation',
    })
    const result = parseDecision(json)
    expect(result.action.type).toBe('dispatch_worker')
    expect(result.messageToUser).toBe('Starting investigation')
  })

  it('parses dispatch_workers action', () => {
    const json = JSON.stringify({
      action: {
        type: 'dispatch_workers',
        workers: [
          { goal: 'a', artifacts: [], skill: 'investigation', allowUserQuestions: false, permissionLevel: 'read_only' },
          { goal: 'b', artifacts: [], skill: 'investigation', allowUserQuestions: false, permissionLevel: 'read_only' },
        ],
      },
    })
    const result = parseDecision(json)
    expect(result.action.type).toBe('dispatch_workers')
  })

  it('parses ask_user action', () => {
    const json = JSON.stringify({ action: { type: 'ask_user', question: 'Which DB?', options: ['Postgres', 'SQLite'] } })
    const result = parseDecision(json)
    expect(result.action.type).toBe('ask_user')
  })

  it('parses stop action', () => {
    const json = JSON.stringify({ action: { type: 'stop', reason: 'All done' } })
    const result = parseDecision(json)
    expect(result.action.type).toBe('stop')
  })

  it('extracts JSON from markdown code block', () => {
    const text = 'Here is my decision:\n\n```json\n{"action":{"type":"stop","reason":"done"}}\n```'
    const result = parseDecision(text)
    expect(result.action.type).toBe('stop')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseDecision('not json')).toThrow(DecisionParseError)
  })

  it('throws on unknown action type', () => {
    const json = JSON.stringify({ action: { type: 'unknown' } })
    expect(() => parseDecision(json)).toThrow(DecisionParseError)
  })

  // --- Semantic validation ---

  describe('dispatch_worker semantic validation', () => {
    it('rejects missing worker object', () => {
      const json = JSON.stringify({ action: { type: 'dispatch_worker' } })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('worker')
        expect(err.details.actionType).toBe('dispatch_worker')
      }
    })

    it('rejects worker without skill', () => {
      const json = JSON.stringify({
        action: {
          type: 'dispatch_worker',
          worker: { goal: 'do stuff', artifacts: [] },
        },
      })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('worker.skill')
      }
    })

    it('rejects worker without goal', () => {
      const json = JSON.stringify({
        action: {
          type: 'dispatch_worker',
          worker: { skill: 'investigation', artifacts: [] },
        },
      })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('worker.goal')
      }
    })
  })

  describe('dispatch_workers semantic validation', () => {
    it('rejects missing workers array', () => {
      const json = JSON.stringify({ action: { type: 'dispatch_workers' } })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('workers')
      }
    })

    it('rejects empty workers array', () => {
      const json = JSON.stringify({ action: { type: 'dispatch_workers', workers: [] } })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
    })

    it('rejects worker in array without skill', () => {
      const json = JSON.stringify({
        action: {
          type: 'dispatch_workers',
          workers: [{ goal: 'a', artifacts: [] }],
        },
      })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('worker.skill')
      }
    })
  })

  describe('ask_user semantic validation', () => {
    it('rejects missing question', () => {
      const json = JSON.stringify({ action: { type: 'ask_user' } })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('question')
        expect(err.details.actionType).toBe('ask_user')
      }
    })

    it('rejects empty question', () => {
      const json = JSON.stringify({ action: { type: 'ask_user', question: '' } })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
    })
  })

  describe('update_workspace semantic validation', () => {
    it('rejects missing updates array', () => {
      const json = JSON.stringify({ action: { type: 'update_workspace' } })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('updates')
        expect(err.details.actionType).toBe('update_workspace')
      }
    })

    it('accepts empty updates array', () => {
      const json = JSON.stringify({ action: { type: 'update_workspace', updates: [] } })
      const result = parseDecision(json)
      expect(result.action.type).toBe('update_workspace')
    })
  })

  describe('checkpoint semantic validation', () => {
    it('rejects missing summary', () => {
      const json = JSON.stringify({ action: { type: 'checkpoint' } })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('summary')
        expect(err.details.actionType).toBe('checkpoint')
      }
    })
  })

  describe('complete_story semantic validation', () => {
    it('rejects missing scenarioId', () => {
      const json = JSON.stringify({ action: { type: 'complete_story', summary: 'done' } })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('scenarioId')
      }
    })

    it('rejects missing summary', () => {
      const json = JSON.stringify({ action: { type: 'complete_story', scenarioId: 's-1' } })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('summary')
      }
    })
  })

  describe('stop semantic validation', () => {
    it('rejects missing reason', () => {
      const json = JSON.stringify({ action: { type: 'stop' } })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('reason')
        expect(err.details.actionType).toBe('stop')
      }
    })
  })

  describe('DecisionParseError details', () => {
    it('includes typed error details for parse failures', () => {
      try {
        parseDecision('not json')
      } catch (e) {
        const err = e as DecisionParseError
        expect(err).toBeInstanceOf(DecisionParseError)
        expect(err.details.type).toBe('parse_error')
      }
    })

    it('includes typed error details for unknown action', () => {
      const json = JSON.stringify({ action: { type: 'explode' } })
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.type).toBe('unknown_action')
        expect(err.details.actionType).toBe('explode')
      }
    })
  })
})
