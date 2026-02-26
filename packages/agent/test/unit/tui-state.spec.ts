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

  it('adds a worker on worker:created event', () => {
    const action: TuiAction = {
      type: 'event',
      event: {
        id: 'evt-1',
        type: 'worker:created',
        data: { agentId: 'w-1', goal: 'Investigate auth', skill: 'investigation', permission: 'read_only' },
        createdAt: '2026-01-01T00:00:00Z',
      },
    }
    const state = tuiReducer(initialState, action)
    expect(state.workers).toHaveLength(1)
    expect(state.workers[0].goal).toBe('Investigate auth')
    expect(state.workers[0].status).toBe('running')
  })

  it('updates worker on worker:complete event', () => {
    const dispatched = tuiReducer(initialState, {
      type: 'event',
      event: {
        id: 'evt-1',
        type: 'worker:created',
        data: { agentId: 'w-1', goal: 'Investigate auth', skill: 'investigation' },
        createdAt: '2026-01-01T00:00:00Z',
      },
    })
    const state = tuiReducer(dispatched, {
      type: 'event',
      event: {
        id: 'evt-2',
        type: 'worker:complete',
        data: { agentId: 'w-1', summary: 'Found 3 seams' },
        createdAt: '2026-01-01T00:00:01Z',
      },
    })
    expect(state.workers[0].status).toBe('complete')
    expect(state.workers[0].result?.summary).toBe('Found 3 seams')
  })

  it('syncs events from events_sync action', () => {
    const events = [
      { id: 'evt-1', type: 'session:start', data: { goal: 'test' }, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'evt-2', type: 'worker:created', data: { agentId: 'w-1' }, createdAt: '2026-01-01T00:00:01Z' },
    ]
    const state = tuiReducer(initialState, { type: 'events_sync', events })
    expect(state.events).toHaveLength(2)
  })

  it('syncs workers from workers_sync action', () => {
    const agents = [
      {
        id: 'w-1', role: 'worker' as const, status: 'active' as const,
        goal: 'Investigate auth', skill: 'investigation', permission: 'read_only',
        createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      },
    ]
    const state = tuiReducer(initialState, { type: 'workers_sync', agents })
    expect(state.workers).toHaveLength(1)
    expect(state.workers[0].goal).toBe('Investigate auth')
    expect(state.workers[0].status).toBe('running')
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
