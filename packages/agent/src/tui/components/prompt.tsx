import React, { useState } from 'react'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import type { PendingQuestion } from '../state.js'

interface Props {
  phase: 'awaiting_goal' | 'running' | 'stopped'
  pendingQuestion?: PendingQuestion
  onSubmit: (text: string) => void
}

export function Prompt({ phase, pendingQuestion, onSubmit }: Props): React.ReactElement {
  const [value, setValue] = useState('')

  const placeholder = pendingQuestion
    ? 'Type answer or number...'
    : phase === 'awaiting_goal'
      ? 'Enter a goal to start...'
      : 'Send a message to the agent...'

  const handleSubmit = (text: string) => {
    if (!text.trim()) return
    if (pendingQuestion) {
      // Check if it's a number selecting an option
      const idx = parseInt(text, 10)
      if (pendingQuestion.options && idx >= 1 && idx <= pendingQuestion.options.length) {
        pendingQuestion.resolve(pendingQuestion.options[idx - 1])
      } else {
        pendingQuestion.resolve(text)
      }
    }
    onSubmit(text)
    setValue('')
  }

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      {pendingQuestion && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="yellow">? {pendingQuestion.question}</Text>
          {pendingQuestion.options && (
            <Box flexDirection="column">
              {pendingQuestion.options.map((opt, i) => (
                <Text key={opt}>  [{i + 1}] {opt}</Text>
              ))}
            </Box>
          )}
        </Box>
      )}
      <Box>
        <Text color="green">&gt; </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder={placeholder}
        />
      </Box>
    </Box>
  )
}
