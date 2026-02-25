import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { EventPanel } from '../../src/tui/components/events.js'
import type { AgentEvent } from '../../src/types.js'

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
      { timestamp: '2026-01-01T10:32:05Z', type: 'cycle:start', cycleId: 'cycle-1', data: { trigger: 'startup' } },
      { timestamp: '2026-01-01T10:32:06Z', type: 'worker:dispatch', cycleId: 'cycle-1', data: { goal: 'Investigate auth' } },
    ]
    const { lastFrame } = render(<EventPanel events={events} phase="running" />)
    expect(lastFrame()).toContain('cycle:start')
    expect(lastFrame()).toContain('worker:dispatch')
    expect(lastFrame()).toContain('Investigate auth')
  })
})
