import React from 'react'
import { Box, Text } from 'ink'
import { Spinner } from '@inkjs/ui'
import type { AgentEvent } from '../../types.js'

interface Props {
  events: AgentEvent[]
  phase: 'awaiting_goal' | 'running' | 'stopped'
}

export function EventPanel({ events, phase }: Props): React.ReactElement {
  // Show only the last N events to keep the panel manageable
  const visible = events.slice(-50)

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} flexGrow={1}>
      <Text bold>Events</Text>
      {events.length === 0 && phase === 'awaiting_goal' && (
        <Text dimColor>Waiting for goal...</Text>
      )}
      {events.length === 0 && phase === 'running' && (
        <Spinner label="Supervisor analyzing..." />
      )}
      {visible.map((event) => (
        <EventLine key={`${event.timestamp}-${event.type}`} event={event} />
      ))}
    </Box>
  )
}

function EventLine({ event }: { event: AgentEvent }): React.ReactElement {
  const time = new Date(event.timestamp).toLocaleTimeString('en-US', { hour12: false })
  const dataStr = formatEventData(event)

  return (
    <Text>
      <Text dimColor>[{time}]</Text> <Text color={eventColor(event.type)}>{event.type}</Text>
      {dataStr && <Text> {dataStr}</Text>}
    </Text>
  )
}

function eventColor(type: string): string {
  if (type.startsWith('worker:')) return 'cyan'
  if (type.startsWith('cycle:')) return 'blue'
  if (type.startsWith('advancement:')) return 'yellow'
  if (type === 'decision') return 'magenta'
  return 'white'
}

function formatEventData(event: AgentEvent): string {
  const d = event.data
  switch (event.type) {
    case 'worker:dispatch':
      return `goal="${d.goal}"`
    case 'worker:result':
      return `${d.status} — "${d.summary}"`
    case 'decision':
      return `${d.action}`
    case 'cycle:start':
      return `trigger=${d.trigger}`
    case 'advancement:blocked':
      return `${d.scenarioId} → ${d.to}: ${d.reason}`
    case 'advancement:warning':
      return `${d.scenarioId}: ${d.warning}`
    default:
      return Object.keys(d).length > 0 ? JSON.stringify(d) : ''
  }
}
