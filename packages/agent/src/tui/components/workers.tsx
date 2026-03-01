import React from 'react'
import { Box, Text } from 'ink'
import { Spinner } from '@inkjs/ui'
import type { WorkerStatus, WorkerStream, WorkerStreamEntry } from '../state.js'

interface Props {
  workers: WorkerStatus[]
  workerStreams?: Map<string, WorkerStream>
  height?: number
  scrollOffset?: number
}

const STATUS_ICON: Record<WorkerStatus['status'], string> = {
  running: '',
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

export function WorkerPanel({ workers, workerStreams, height, scrollOffset = 0 }: Props): React.ReactElement {
  // Find the active worker for stream display
  const running = workers.find((w) => w.status === 'running')
  const activeStream = running
    ? workerStreams?.get(running.id)
    : findLatestStream(workerStreams)

  return (
    <Box flexDirection="column" width="100%" height={height} paddingX={1}>
      <Text bold>Workers</Text>
      {workers.length === 0 ? (
        <Text dimColor>No workers dispatched yet.</Text>
      ) : (
        workers.map((w) => <WorkerLine key={w.id} worker={w} stream={workerStreams?.get(w.id)} />)
      )}
      {activeStream && activeStream.entries.length > 0 && (
        <StreamSection stream={activeStream} workers={workers} />
      )}
    </Box>
  )
}

function StreamSection({ stream, workers }: { stream: WorkerStream; workers: WorkerStatus[] }): React.ReactElement {
  const isRunning = workers.some((w) => w.id === stream.workerId && w.status === 'running')
  const recent = stream.entries.slice(-20)

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text bold>Output <Text dimColor>({stream.workerId.slice(0, 8)})</Text></Text>
        {isRunning && <Box marginLeft={1}><Spinner /></Box>}
      </Box>
      {recent.map((entry, i) => (
        <StreamLine key={i} entry={entry} dim={i < recent.length - 1} />
      ))}
    </Box>
  )
}

function StreamLine({ entry, dim }: { entry: WorkerStreamEntry; dim: boolean }): React.ReactElement {
  switch (entry.type) {
    case 'text':
      return <Text dimColor={dim} wrap="truncate-end">{truncate(entry.content, 120)}</Text>
    case 'tool_use':
      return (
        <Text dimColor={dim} wrap="truncate-end">
          <Text color="cyan">{'>'} {entry.tool}</Text> {truncate(entry.content, 100)}
        </Text>
      )
    case 'tool_result':
      return (
        <Text dimColor wrap="truncate-end">
          {'  <'} {entry.tool}: {truncate(entry.content, 100)}
        </Text>
      )
  }
}

function WorkerLine({ worker, stream }: { worker: WorkerStatus; stream?: WorkerStream }): React.ReactElement {
  const icon = STATUS_ICON[worker.status]
  const color = STATUS_COLOR[worker.status]
  const endTime = worker.completedAt ?? Date.now()
  const elapsed = formatElapsed(endTime - worker.startedAt)
  const isOld = worker.status !== 'running'

  const latestTool = stream?.entries
    .filter((e) => e.type === 'tool_use')
    .at(-1)

  return (
    <Box flexDirection="column">
      {worker.status === 'running' ? (
        <Spinner label={` ${truncate(worker.goal, 60)}`} />
      ) : (
        <Text dimColor={isOld} wrap="truncate-end">
          <Text color={color}>{icon}</Text> {worker.goal}
        </Text>
      )}
      <Text dimColor={isOld} wrap="truncate-end">
        {'  '}{worker.skill} | {worker.permissionLevel} | {elapsed}
        {worker.status === 'stuck' && <Text color="red"> — stuck</Text>}
      </Text>
      {worker.status === 'running' && latestTool && (
        <Text dimColor wrap="truncate-end">  {'>'} {latestTool.tool} {truncate(latestTool.content, 60)}</Text>
      )}
      {worker.result && (
        <Text dimColor wrap="truncate-end">  {truncate(worker.result.summary, 80)}</Text>
      )}
    </Box>
  )
}

function findLatestStream(streams?: Map<string, WorkerStream>): WorkerStream | undefined {
  if (!streams) return undefined
  let latest: { workerId: string; time: number } | undefined
  for (const [id, stream] of streams) {
    const lastEntry = stream.entries[stream.entries.length - 1]
    if (lastEntry && (!latest || lastEntry.timestamp > latest.time)) {
      latest = { workerId: id, time: lastEntry.timestamp }
    }
  }
  return latest ? streams.get(latest.workerId) : undefined
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

function truncate(text: string, maxLen: number): string {
  const oneLine = text.replace(/\n/g, ' ').trim()
  if (oneLine.length <= maxLen) return oneLine
  return oneLine.slice(0, maxLen - 1) + '…'
}
