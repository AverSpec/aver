import { describe, it, expect } from 'vitest'
import { parseDecision } from '../../src/supervisor/decisions.js'

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
    expect(() => parseDecision('not json')).toThrow()
  })

  it('throws on unknown action type', () => {
    const json = JSON.stringify({ action: { type: 'unknown' } })
    expect(() => parseDecision(json)).toThrow()
  })
})
