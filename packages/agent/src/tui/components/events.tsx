import React from 'react'
import { Box, Text } from 'ink'
import { Spinner } from '@inkjs/ui'
import type { AgentEvent } from '../../db/event-store.js'

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
        <EventLine key={`${event.createdAt}-${event.type}`} event={event} />
      ))}
    </Box>
  )
}

function EventLine({ event }: { event: AgentEvent }): React.ReactElement {
  const time = new Date(event.createdAt).toLocaleTimeString('en-US', { hour12: false })
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
  if (type.startsWith('session:')) return 'blue'
  if (type.startsWith('advancement:') || type.startsWith('scenario:')) return 'yellow'
  if (type.startsWith('supervisor:')) return 'magenta'
  if (type.startsWith('human:')) return 'green'
  return 'white'
}

function formatEventData(event: AgentEvent): string {
  const d = event.data
  switch (event.type) {
    case 'worker:created':
      return `goal="${d.goal}"`
    case 'worker:complete':
      return `agent=${d.agentId}`
    case 'worker:error':
      return `agent=${d.agentId}: ${d.error}`
    case 'worker:terminated':
      return `agent=${d.agentId}`
    case 'supervisor:decision':
      return `${d.action}`
    case 'session:start':
      return `goal="${d.goal}"`
    case 'session:stop':
      return `reason=${d.reason}`
    case 'scenario:advanced':
      return `${d.scenarioId} -> ${d.stage}`
    case 'advancement:blocked':
      return `${d.scenarioId}: ${d.reason}`
    case 'advancement:warning':
      return `${d.scenarioId}: ${d.warning}`
    case 'human:answer':
      return `"${d.answer}"`
    default:
      return Object.keys(d).length > 0 ? JSON.stringify(d) : ''
  }
}
