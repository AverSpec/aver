import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { EventPanel } from '../../src/tui/components/events.js'
import type { AgentEvent } from '../../src/db/event-store.js'

describe('EventPanel', () => {
  it('shows waiting message when no events', () => {
    const { lastFrame } = render(<EventPanel events={[]} phase="awaiting_goal" />)
    expect(lastFrame()).toContain('Waiting')
  })

  it('shows spinner when running with no events', () => {
    const { lastFrame } = render(<EventPanel events={[]} phase="running" />)
    expect(lastFrame()).toContain('Supervisor analyzing')
  })

  it('renders events with timestamp and type', () => {
    const events: AgentEvent[] = [
      { id: 'evt-1', type: 'session:start', data: { goal: 'test' }, createdAt: '2026-01-01T10:32:05Z' },
      { id: 'evt-2', type: 'worker:created', data: { agentId: 'w-1', goal: 'Investigate auth' }, createdAt: '2026-01-01T10:32:06Z' },
    ]
    const { lastFrame } = render(<EventPanel events={events} phase="running" />)
    expect(lastFrame()).toContain('session:start')
    expect(lastFrame()).toContain('worker:created')
    expect(lastFrame()).toContain('Investigate auth')
  })
})
