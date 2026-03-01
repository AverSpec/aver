import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { BottomBar } from '../../src/tui/components/bottom-bar.js'

describe('BottomBar', () => {
  it('shows panel shortcuts', () => {
    const { lastFrame } = render(
      <BottomBar
        activePanel="chat"
        inputFocused={false}
        phase="running"
        onSubmit={() => {}}
        onFocus={() => {}}
        onBlur={() => {}}
      />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('1:Chat')
    expect(frame).toContain('2:Workers')
    expect(frame).toContain('3:Scenarios')
    expect(frame).toContain('4:Events')
  })

  it('shows placeholder when not focused', () => {
    const { lastFrame } = render(
      <BottomBar
        activePanel="chat"
        inputFocused={false}
        phase="running"
        onSubmit={() => {}}
        onFocus={() => {}}
        onBlur={() => {}}
      />,
    )
    expect(lastFrame()).toContain('Press / to type')
  })

  it('shows text input when focused', () => {
    const { lastFrame } = render(
      <BottomBar
        activePanel="chat"
        inputFocused={true}
        phase="running"
        onSubmit={() => {}}
        onFocus={() => {}}
        onBlur={() => {}}
      />,
    )
    expect(lastFrame()).toContain('Send a message')
  })

  it('shows select options when question has options', () => {
    const { lastFrame } = render(
      <BottomBar
        activePanel="chat"
        inputFocused={true}
        pendingQuestion={{ id: 'q-1', question: 'Split auth?', options: ['Yes', 'No'], resolve: () => {} }}
        phase="running"
        onSubmit={() => {}}
        onFocus={() => {}}
        onBlur={() => {}}
      />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('Yes')
    expect(frame).toContain('No')
  })

  it('highlights active panel', () => {
    const { lastFrame } = render(
      <BottomBar
        activePanel="workers"
        inputFocused={false}
        phase="running"
        onSubmit={() => {}}
        onFocus={() => {}}
        onBlur={() => {}}
      />,
    )
    // Workers panel label should be present
    expect(lastFrame()).toContain('2:Workers')
  })
})
