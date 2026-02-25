import React from 'react'
import { Box, Text } from 'ink'
import type { WorkerStatus } from '../state.js'

interface Props {
  workers: WorkerStatus[]
}

const STATUS_ICON: Record<WorkerStatus['status'], string> = {
  running: '⏳',
  complete: '✓',
  stuck: '✗',
  error: '✗',
}

const STATUS_COLOR: Record<WorkerStatus['status'], string> = {
  running: 'yellow',
  complete: 'green',
  stuck: 'red',
  error: 'red',
}

export function WorkerPanel({ workers }: Props): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} minHeight={6}>
      <Text bold>Workers</Text>
      {workers.length === 0 ? (
        <Text dimColor>No workers dispatched yet.</Text>
      ) : (
        workers.map((w) => <WorkerLine key={w.id} worker={w} />)
      )}
    </Box>
  )
}

function WorkerLine({ worker }: { worker: WorkerStatus }): React.ReactElement {
  const icon = STATUS_ICON[worker.status]
  const color = STATUS_COLOR[worker.status]
  const elapsed = formatElapsed(Date.now() - worker.startedAt)
  const isOld = worker.status !== 'running' && Date.now() - worker.startedAt > 10_000

  return (
    <Box flexDirection="column">
      <Text dimColor={isOld}>
        <Text color={color}>{icon}</Text> {worker.goal}
      </Text>
      <Text dimColor={isOld}>
        {'  '}{worker.skill} | {worker.permissionLevel} | {elapsed}
        {worker.status === 'stuck' && <Text color="red"> — stuck</Text>}
      </Text>
      {worker.result && (
        <Text dimColor>  {worker.result.summary}</Text>
      )}
    </Box>
  )
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${String(secs).padStart(2, '0')}`
}
