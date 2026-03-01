import React, { useState } from 'react'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import { Select } from '@inkjs/ui'
import type { PanelId, PendingQuestion } from '../state.js'

interface Props {
  activePanel: PanelId
  inputFocused: boolean
  pendingQuestion?: PendingQuestion
  phase: 'awaiting_goal' | 'running' | 'stopped'
  onSubmit: (text: string) => void
  onFocus: () => void
  onBlur: () => void
}

const PANEL_LABELS: Record<PanelId, string> = {
  chat: '1:Chat',
  workers: '2:Workers',
  scenarios: '3:Scenarios',
  events: '4:Events',
}

export function BottomBar({ activePanel, inputFocused, pendingQuestion, phase, onSubmit, onFocus, onBlur }: Props): React.ReactElement {
  const [value, setValue] = useState('')
  const [mode, setMode] = useState<'select' | 'freeform'>('select')

  const handleTextSubmit = (text: string) => {
    if (!text.trim()) return
    if (pendingQuestion) {
      pendingQuestion.resolve(text)
    }
    onSubmit(text)
    setValue('')
    setMode('select')
  }

  const handleSelect = (selected: string) => {
    if (selected === '__freeform__') {
      setMode('freeform')
      return
    }
    if (pendingQuestion) {
      pendingQuestion.resolve(selected)
    }
    onSubmit(selected)
    setMode('select')
  }

  // If question with options and in select mode, show Select
  if (inputFocused && pendingQuestion?.options && mode === 'select') {
    const selectOptions = [
      ...pendingQuestion.options.map((opt) => ({ label: opt, value: opt })),
      { label: 'Other (type your own)', value: '__freeform__' },
    ]
    return (
      <Box flexDirection="column">
        <ShortcutBar activePanel={activePanel} />
        <Box paddingX={1}>
          <Select options={selectOptions} onChange={handleSelect} />
        </Box>
      </Box>
    )
  }

  // Text input mode
  if (inputFocused) {
    const placeholder = pendingQuestion ? 'Type your answer...' : 'Send a message to the agent...'
    return (
      <Box flexDirection="column">
        <ShortcutBar activePanel={activePanel} />
        <Box paddingX={1}>
          <Text color="green">&gt; </Text>
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={handleTextSubmit}
            placeholder={placeholder}
          />
        </Box>
      </Box>
    )
  }

  // Not focused — show shortcut bar + placeholder
  return (
    <Box flexDirection="column">
      <ShortcutBar activePanel={activePanel} />
      <Box paddingX={1}>
        <Text dimColor>Press / to type{phase === 'stopped' ? ' (session stopped)' : '...'}</Text>
      </Box>
    </Box>
  )
}

function ShortcutBar({ activePanel }: { activePanel: PanelId }): React.ReactElement {
  return (
    <Box paddingX={1} gap={2}>
      {(Object.entries(PANEL_LABELS) as [PanelId, string][]).map(([id, label]) => (
        <Text key={id} bold={id === activePanel} color={id === activePanel ? 'cyan' : undefined} dimColor={id !== activePanel}>
          {label}
        </Text>
      ))}
      <Text dimColor>  /:input  esc:nav  ↑↓:scroll</Text>
    </Box>
  )
}
