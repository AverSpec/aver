import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { WorkerPanel } from '../../src/tui/components/workers.js'
import type { WorkerStatus } from '../../src/tui/state.js'

describe('WorkerPanel', () => {
  it('shows empty message when no workers', () => {
    const { lastFrame } = render(<WorkerPanel workers={[]} />)
    expect(lastFrame()).toContain('No workers dispatched')
  })

  it('shows running worker with goal and skill', () => {
    const workers: WorkerStatus[] = [
      { id: 'w-1', goal: 'Investigate auth', skill: 'investigation', permissionLevel: 'read_only', status: 'running', startedAt: Date.now() },
    ]
    const { lastFrame } = render(<WorkerPanel workers={workers} />)
    expect(lastFrame()).toContain('Investigate auth')
    expect(lastFrame()).toContain('investigation')
    expect(lastFrame()).toContain('read_only')
  })

  it('shows completed worker with summary', () => {
    const workers: WorkerStatus[] = [
      { id: 'w-1', goal: 'Map rules', skill: 'scenario-mapping', permissionLevel: 'read_only', status: 'complete', startedAt: Date.now() - 60000, result: { summary: 'Found 3 rules' } },
    ]
    const { lastFrame } = render(<WorkerPanel workers={workers} />)
    expect(lastFrame()).toContain('Found 3 rules')
  })

  it('shows stuck worker', () => {
    const workers: WorkerStatus[] = [
      { id: 'w-1', goal: 'Trace boundaries', skill: 'investigation', permissionLevel: 'read_only', status: 'stuck', startedAt: Date.now() },
    ]
    const { lastFrame } = render(<WorkerPanel workers={workers} />)
    expect(lastFrame()).toContain('stuck')
  })
})
