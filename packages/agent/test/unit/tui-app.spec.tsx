import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { App } from '../../src/tui/app.js'
import { DEFAULT_CONFIG } from '../../src/types.js'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('TUI App', () => {
  it('renders TuiShell with panel shortcuts on startup', () => {
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
    expect(frame).toContain('1:Chat')
    expect(frame).toContain('2:Workers')
    expect(frame).toContain('3:Scenarios')
    expect(frame).toContain('4:Events')
  })
})
