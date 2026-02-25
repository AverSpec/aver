import React from 'react'
import { Box, Text } from 'ink'
import type { Scenario } from '@aver/workspace'

interface Props {
  scenarios: Scenario[]
}

const STAGE_ICON: Record<string, string> = {
  captured: '○',
  characterized: '◐',
  mapped: '◑',
  specified: '●',
  implemented: '✓',
}

const STAGE_COLOR: Record<string, string> = {
  captured: 'white',
  characterized: 'yellow',
  mapped: 'yellow',
  specified: 'cyan',
  implemented: 'green',
}

export function ScenarioPanel({ scenarios }: Props): React.ReactElement {
  const implemented = scenarios.filter((s) => s.stage === 'implemented').length

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} minHeight={6}>
      <Text bold>Scenarios</Text>
      {scenarios.length === 0 ? (
        <Text dimColor>No scenarios yet — the supervisor will create them.</Text>
      ) : (
        <>
          <Text dimColor>Progress: {implemented}/{scenarios.length} implemented</Text>
          {scenarios.map((s) => (
            <ScenarioLine key={s.id} scenario={s} />
          ))}
        </>
      )}
    </Box>
  )
}

function ScenarioLine({ scenario }: { scenario: Scenario }): React.ReactElement {
  const icon = STAGE_ICON[scenario.stage] ?? '?'
  const color = STAGE_COLOR[scenario.stage] ?? 'white'
  const openQs = scenario.questions.filter((q) => !q.answer).length

  const meta: string[] = []
  if (scenario.mode) meta.push(`mode: ${scenario.mode}`)
  if (openQs > 0) meta.push(`questions: ${openQs}`)
  const linked = !!(scenario.domainOperation || scenario.testNames?.length)
  if (linked) meta.push('linked')

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={color}>{icon}</Text> <Text color={color}>[{scenario.stage}]</Text> {scenario.behavior}
      </Text>
      {meta.length > 0 && (
        <Text dimColor>  {meta.join('  ')}</Text>
      )}
    </Box>
  )
}
