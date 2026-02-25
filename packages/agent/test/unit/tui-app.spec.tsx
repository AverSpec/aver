import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { App } from '../../src/tui/app.js'
import { DEFAULT_CONFIG } from '../../src/types.js'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('TUI App', () => {
  it('renders all panels in awaiting_goal phase', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aver-tui-test-'))
    const { lastFrame } = render(
      <App
        agentPath={join(dir, 'agent')}
        workspacePath={join(dir, 'workspace')}
        projectId="test"
        config={DEFAULT_CONFIG}
      />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('Scenarios')
    expect(frame).toContain('Workers')
    expect(frame).toContain('Events')
    expect(frame).toContain('Enter a goal')
  })
})
