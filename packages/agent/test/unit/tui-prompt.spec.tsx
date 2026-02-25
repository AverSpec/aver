import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { Prompt } from '../../src/tui/components/prompt.js'

describe('Prompt', () => {
  it('shows goal placeholder when awaiting goal', () => {
    const { lastFrame } = render(
      <Prompt phase="awaiting_goal" onSubmit={() => {}} />,
    )
    expect(lastFrame()).toContain('Enter a goal')
  })

  it('shows message placeholder when running', () => {
    const { lastFrame } = render(
      <Prompt phase="running" onSubmit={() => {}} />,
    )
    expect(lastFrame()).toContain('Send a message')
  })

  it('shows pending question above input', () => {
    const { lastFrame } = render(
      <Prompt
        phase="running"
        pendingQuestion={{ id: 'q-1', question: 'Split auth?', options: ['Yes', 'No'], resolve: () => {} }}
        onSubmit={() => {}}
      />,
    )
    expect(lastFrame()).toContain('Split auth?')
    expect(lastFrame()).toContain('Yes')
    expect(lastFrame()).toContain('No')
  })
})
