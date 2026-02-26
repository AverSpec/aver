// TODO: rewrite acceptance tests for AgentNetwork (Task 21)
// CycleEngine-based tests removed in Task 16.
// The adapter (./adapter.ts) is stubbed — all actions throw.
// These tests will be rewritten against the new AgentNetwork in Task 21.

import { describe, it } from 'vitest'

describe('AverAgent acceptance (Task 21)', () => {
  it.todo('stops immediately when supervisor says stop')
  it.todo('records session goal')
  it.todo('dispatches single worker and persists artifact')
  it.todo('dispatches parallel workers')
  it.todo('pauses on ask_user without onQuestion')
  it.todo('resumes from paused state')
  it.todo('handles checkpoint and continues')
  it.todo('handles complete_story and continues')
  it.todo('accumulates supervisor token usage across cycles')
  it.todo('accumulates worker token usage')
  it.todo('delivers messageToUser via onMessage')
  it.todo('persists artifact content readable via query')
  it.todo('records correct cycle and worker counts')
})
