import { describe, it, expect } from 'vitest'
import { initialState, tuiReducer } from '../../src/tui/state.js'
import type { TuiAction } from '../../src/tui/state.js'

describe('tuiReducer', () => {
  it('starts with empty state', () => {
    expect(initialState.scenarios).toEqual([])
    expect(initialState.workers).toEqual([])
    expect(initialState.events).toEqual([])
    expect(initialState.pendingQuestion).toBeUndefined()
  })

  it('adds a worker on worker:dispatch event', () => {
    const action: TuiAction = {
      type: 'event',
      event: {
        timestamp: '2026-01-01T00:00:00Z',
        type: 'worker:dispatch',
        cycleId: 'cycle-1',
        data: { goal: 'Investigate auth', skill: 'investigation', permissionLevel: 'read_only' },
      },
    }
    const state = tuiReducer(initialState, action)
    expect(state.workers).toHaveLength(1)
    expect(state.workers[0].goal).toBe('Investigate auth')
    expect(state.workers[0].status).toBe('running')
  })

  it('updates worker on worker:result event', () => {
    const dispatched = tuiReducer(initialState, {
      type: 'event',
      event: {
        timestamp: '2026-01-01T00:00:00Z',
        type: 'worker:dispatch',
        cycleId: 'cycle-1',
        data: { goal: 'Investigate auth', skill: 'investigation' },
      },
    })
    const state = tuiReducer(dispatched, {
      type: 'event',
      event: {
        timestamp: '2026-01-01T00:00:01Z',
        type: 'worker:result',
        cycleId: 'cycle-1',
        data: { summary: 'Found 3 seams', status: 'complete' },
      },
    })
    expect(state.workers[0].status).toBe('complete')
    expect(state.workers[0].result?.summary).toBe('Found 3 seams')
  })

  it('sets scenarios on scenarios_updated', () => {
    const scenarios = [
      {
        id: 'sc-1', stage: 'captured' as const, behavior: 'user login',
        rules: [], examples: [], questions: [], constraints: [], seams: [],
        transitions: [], createdAt: '', updatedAt: '',
      },
    ]
    const state = tuiReducer(initialState, { type: 'scenarios_updated', scenarios })
    expect(state.scenarios).toHaveLength(1)
    expect(state.scenarios[0].behavior).toBe('user login')
  })

  it('sets pending question', () => {
    const resolve = () => {}
    const state = tuiReducer(initialState, {
      type: 'question_received',
      question: { id: 'q-1', question: 'Split auth?', options: ['Yes', 'No'], resolve },
    })
    expect(state.pendingQuestion?.question).toBe('Split auth?')
  })

  it('clears pending question on answer', () => {
    const resolve = () => {}
    const withQuestion = tuiReducer(initialState, {
      type: 'question_received',
      question: { id: 'q-1', question: 'Split auth?', resolve },
    })
    const state = tuiReducer(withQuestion, { type: 'question_answered', questionId: 'q-1' })
    expect(state.pendingQuestion).toBeUndefined()
  })

  it('queues second question when one is already pending', () => {
    const resolve1 = () => {}
    const resolve2 = () => {}
    const withFirst = tuiReducer(initialState, {
      type: 'question_received',
      question: { id: 'q-1', question: 'First?', resolve: resolve1 },
    })
    const withSecond = tuiReducer(withFirst, {
      type: 'question_received',
      question: { id: 'q-2', question: 'Second?', resolve: resolve2 },
    })
    expect(withSecond.pendingQuestion?.id).toBe('q-1')
    expect(withSecond.questionQueue).toHaveLength(1)
    expect(withSecond.questionQueue[0].id).toBe('q-2')
  })

  it('promotes queued question after answering current', () => {
    const resolve1 = () => {}
    const resolve2 = () => {}
    let state = tuiReducer(initialState, {
      type: 'question_received',
      question: { id: 'q-1', question: 'First?', resolve: resolve1 },
    })
    state = tuiReducer(state, {
      type: 'question_received',
      question: { id: 'q-2', question: 'Second?', resolve: resolve2 },
    })
    state = tuiReducer(state, { type: 'question_answered', questionId: 'q-1' })
    expect(state.pendingQuestion?.id).toBe('q-2')
    expect(state.questionQueue).toHaveLength(0)
  })
})
