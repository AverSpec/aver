import React from 'react'
import { Box, Text } from 'ink'
import { Spinner } from '@inkjs/ui'
import type { ChatMessage } from '../state.js'

interface Props {
  messages: ChatMessage[]
  supervisorThinking: boolean
  scrollOffset: number
  height: number
}

export function ChatPanel({ messages, supervisorThinking, scrollOffset, height }: Props): React.ReactElement {
  // Apply scroll: offset counts messages from the bottom
  const endIdx = scrollOffset > 0 ? messages.length - scrollOffset : messages.length
  const visible = messages.slice(Math.max(0, endIdx - height), Math.max(0, endIdx))

  return (
    <Box flexDirection="column" width="100%" height={height} paddingX={1}>
      {visible.length === 0 && !supervisorThinking && (
        <Text dimColor>Waiting for conversation...</Text>
      )}
      {visible.map((msg, i) => (
        <MessageLine key={i} message={msg} />
      ))}
      {supervisorThinking && scrollOffset === 0 && (
        <Spinner label=" Supervisor thinking..." />
      )}
      {scrollOffset > 0 && (
        <Text dimColor italic>↓ {scrollOffset} more below — press ↓ to scroll down</Text>
      )}
    </Box>
  )
}

function MessageLine({ message }: { message: ChatMessage }): React.ReactElement {
  const time = new Date(message.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })

  switch (message.role) {
    case 'system':
      return (
        <Text dimColor wrap="wrap">
          <Text>[{time}]</Text> {message.text}
        </Text>
      )
    case 'supervisor':
      return (
        <Box flexDirection="column">
          <Text>
            <Text dimColor>[{time}]</Text> <Text color="magenta" bold>Supervisor:</Text>
            {message.streaming && <Text> <Spinner /></Text>}
          </Text>
          <Box marginLeft={2}>
            <Text wrap="wrap">{message.text}</Text>
          </Box>
        </Box>
      )
    case 'human':
      return (
        <Box flexDirection="column">
          <Text>
            <Text dimColor>[{time}]</Text> <Text color="green" bold>You:</Text>
          </Text>
          <Box marginLeft={2}>
            <Text wrap="wrap">{message.text}</Text>
          </Box>
        </Box>
      )
    case 'question': {
      const color = message.answered ? 'gray' : 'yellow'
      return (
        <Box flexDirection="column">
          <Text>
            <Text dimColor>[{time}]</Text> <Text color={color} bold>? Supervisor asks:</Text>
            {message.answered && <Text dimColor> (answered)</Text>}
          </Text>
          <Box marginLeft={2} flexDirection="column">
            <Text wrap="wrap">{message.text}</Text>
            {message.options && !message.answered && (
              <Box flexDirection="column" marginTop={0}>
                {message.options.map((opt, i) => (
                  <Text key={i} color="yellow">  {i + 1}. {opt}</Text>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      )
    }
  }
}
