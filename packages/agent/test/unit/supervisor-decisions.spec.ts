import { describe, it, expect } from 'vitest'
import { parseDecision, DecisionParseError } from '../../src/supervisor/decisions.js'

describe('parseDecision', () => {
  it('parses create_worker action', () => {
    const json = JSON.stringify({
      action: 'create_worker',
      goal: 'investigate auth',
      skill: 'investigation',
      permission: 'read_only',
      scenarioId: 'sc-1',
    })
    const result = parseDecision(json)
    expect(result.action).toBe('create_worker')
    expect((result as any).goal).toBe('investigate auth')
    expect((result as any).skill).toBe('investigation')
  })

  it('parses assign_goal action', () => {
    const json = JSON.stringify({
      action: 'assign_goal',
      agentId: 'worker-abc',
      goal: 'investigate payments',
    })
    const result = parseDecision(json)
    expect(result.action).toBe('assign_goal')
  })

  it('parses terminate_worker action', () => {
    const json = JSON.stringify({
      action: 'terminate_worker',
      agentId: 'worker-abc',
    })
    const result = parseDecision(json)
    expect(result.action).toBe('terminate_worker')
  })

  it('parses advance_scenario action', () => {
    const json = JSON.stringify({
      action: 'advance_scenario',
      scenarioId: 'sc-1',
      rationale: 'All criteria met',
    })
    const result = parseDecision(json)
    expect(result.action).toBe('advance_scenario')
  })

  it('parses ask_human action', () => {
    const json = JSON.stringify({
      action: 'ask_human',
      question: 'Which DB?',
    })
    const result = parseDecision(json)
    expect(result.action).toBe('ask_human')
  })

  it('parses discuss action', () => {
    const json = JSON.stringify({
      action: 'discuss',
      message: 'Tell me about the login flow',
      scenarioId: 'sc-1',
    })
    const result = parseDecision(json)
    expect(result.action).toBe('discuss')
    expect((result as any).message).toBe('Tell me about the login flow')
  })

  it('parses discuss action without scenarioId (optional)', () => {
    const json = JSON.stringify({
      action: 'discuss',
      message: 'What are the main user stories?',
    })
    const result = parseDecision(json)
    expect(result.action).toBe('discuss')
  })

  it('parses update_scenario action', () => {
    const json = JSON.stringify({
      action: 'update_scenario',
      scenarioId: 'sc-1',
      updates: { behavior: 'updated' },
    })
    const result = parseDecision(json)
    expect(result.action).toBe('update_scenario')
  })

  it('parses revisit_scenario with all required fields', () => {
    const result = parseDecision('{"action":"revisit_scenario","scenarioId":"abc123","targetStage":"captured","rationale":"needs rethink"}')
    expect(result).toEqual({
      action: 'revisit_scenario',
      scenarioId: 'abc123',
      targetStage: 'captured',
      rationale: 'needs rethink',
    })
  })

  it('rejects revisit_scenario without scenarioId', () => {
    expect(() => parseDecision('{"action":"revisit_scenario","targetStage":"captured","rationale":"x"}'))
      .toThrow(/scenarioId/)
  })

  it('rejects revisit_scenario without targetStage', () => {
    expect(() => parseDecision('{"action":"revisit_scenario","scenarioId":"abc","rationale":"x"}'))
      .toThrow(/targetStage/)
  })

  it('rejects revisit_scenario without rationale', () => {
    expect(() => parseDecision('{"action":"revisit_scenario","scenarioId":"abc","targetStage":"captured"}'))
      .toThrow(/rationale/)
  })

  it('parses stop action', () => {
    const json = JSON.stringify({ action: 'stop', reason: 'All done' })
    const result = parseDecision(json)
    expect(result.action).toBe('stop')
  })

  it('parses stop action without reason (optional)', () => {
    const json = JSON.stringify({ action: 'stop' })
    const result = parseDecision(json)
    expect(result.action).toBe('stop')
  })

  it('extracts JSON from markdown code block', () => {
    const text = 'Here is my decision:\n\n```json\n{"action":"stop","reason":"done"}\n```'
    const result = parseDecision(text)
    expect(result.action).toBe('stop')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseDecision('not json')).toThrow(DecisionParseError)
  })

  it('throws on unknown action type', () => {
    const json = JSON.stringify({ action: 'unknown' })
    expect(() => parseDecision(json)).toThrow(DecisionParseError)
  })

  it('throws on missing action field', () => {
    const json = JSON.stringify({ goal: 'investigate' })
    expect(() => parseDecision(json)).toThrow(DecisionParseError)
  })

  // --- Semantic validation: create_worker ---

  describe('create_worker semantic validation', () => {
    it('rejects missing goal', () => {
      const json = JSON.stringify({ action: 'create_worker', skill: 'investigation' })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('goal')
        expect(err.details.actionType).toBe('create_worker')
      }
    })

    it('rejects missing skill', () => {
      const json = JSON.stringify({ action: 'create_worker', goal: 'investigate' })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('skill')
        expect(err.details.actionType).toBe('create_worker')
      }
    })

    it('rejects empty goal', () => {
      const json = JSON.stringify({ action: 'create_worker', goal: '', skill: 'investigation' })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
    })

    it('rejects empty skill', () => {
      const json = JSON.stringify({ action: 'create_worker', goal: 'investigate', skill: '' })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
    })
  })

  // --- Semantic validation: assign_goal ---

  describe('assign_goal semantic validation', () => {
    it('rejects missing agentId', () => {
      const json = JSON.stringify({ action: 'assign_goal', goal: 'do stuff' })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('agentId')
        expect(err.details.actionType).toBe('assign_goal')
      }
    })

    it('rejects missing goal', () => {
      const json = JSON.stringify({ action: 'assign_goal', agentId: 'worker-1' })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('goal')
        expect(err.details.actionType).toBe('assign_goal')
      }
    })
  })

  // --- Semantic validation: terminate_worker ---

  describe('terminate_worker semantic validation', () => {
    it('rejects missing agentId', () => {
      const json = JSON.stringify({ action: 'terminate_worker' })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('agentId')
        expect(err.details.actionType).toBe('terminate_worker')
      }
    })
  })

  // --- Semantic validation: advance_scenario ---

  describe('advance_scenario semantic validation', () => {
    it('rejects missing scenarioId', () => {
      const json = JSON.stringify({ action: 'advance_scenario' })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('scenarioId')
        expect(err.details.actionType).toBe('advance_scenario')
      }
    })

    it('accepts advance_scenario without rationale (optional)', () => {
      const json = JSON.stringify({ action: 'advance_scenario', scenarioId: 'sc-1' })
      const result = parseDecision(json)
      expect(result.action).toBe('advance_scenario')
    })
  })

  // --- Semantic validation: ask_human ---

  describe('ask_human semantic validation', () => {
    it('rejects missing question', () => {
      const json = JSON.stringify({ action: 'ask_human' })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('question')
        expect(err.details.actionType).toBe('ask_human')
      }
    })

    it('rejects empty question', () => {
      const json = JSON.stringify({ action: 'ask_human', question: '' })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
    })
  })

  // --- Semantic validation: discuss ---

  describe('discuss semantic validation', () => {
    it('rejects missing message', () => {
      const json = JSON.stringify({ action: 'discuss' })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('message')
        expect(err.details.actionType).toBe('discuss')
      }
    })

    it('rejects empty message', () => {
      const json = JSON.stringify({ action: 'discuss', message: '' })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
    })
  })

  // --- Semantic validation: update_scenario ---

  describe('update_scenario semantic validation', () => {
    it('rejects missing scenarioId', () => {
      const json = JSON.stringify({ action: 'update_scenario', updates: {} })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('scenarioId')
        expect(err.details.actionType).toBe('update_scenario')
      }
    })

    it('rejects missing updates object', () => {
      const json = JSON.stringify({ action: 'update_scenario', scenarioId: 'sc-1' })
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.field).toBe('updates')
        expect(err.details.actionType).toBe('update_scenario')
      }
    })
  })

  // --- DecisionParseError details ---

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
      const json = JSON.stringify({ action: 'explode' })
      try {
        parseDecision(json)
      } catch (e) {
        const err = e as DecisionParseError
        expect(err.details.type).toBe('unknown_action')
        expect(err.details.actionType).toBe('explode')
      }
    })
  })

  // --- Rejects old nested format ---

  describe('rejects old v1 format', () => {
    it('rejects nested action object (old format)', () => {
      const json = JSON.stringify({
        action: { type: 'dispatch_worker', worker: { goal: 'x', skill: 'y' } },
      })
      // action is an object, not a string — should fail
      expect(() => parseDecision(json)).toThrow(DecisionParseError)
    })
  })
})
