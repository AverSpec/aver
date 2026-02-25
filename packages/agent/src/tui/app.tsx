import React, { useCallback, useEffect, useRef } from 'react'
import { Layout, TopPanels } from './components/layout.js'
import { ScenarioPanel } from './components/scenarios.js'
import { WorkerPanel } from './components/workers.js'
import { EventPanel } from './components/events.js'
import { Prompt } from './components/prompt.js'
import { useEngine } from './hooks/use-engine.js'
import type { AgentConfig } from '../types.js'

export interface AppProps {
  goal?: string
  agentPath: string
  workspacePath: string
  projectId: string
  config: AgentConfig
}

export function App({ goal, agentPath, workspacePath, projectId, config }: AppProps): React.ReactElement {
  const { state, start, sendMessage, answerQuestion } = useEngine({
    agentPath,
    workspacePath,
    projectId,
    config,
  })
  const startedRef = useRef(false)

  // Auto-start if goal was provided via CLI arg
  useEffect(() => {
    if (goal && !startedRef.current) {
      startedRef.current = true
      start(goal)
    }
  }, [goal, start])

  const handleSubmit = useCallback(
    (text: string) => {
      if (state.phase === 'awaiting_goal') {
        startedRef.current = true
        start(text)
        return
      }
      if (state.pendingQuestion) {
        answerQuestion(state.pendingQuestion.id)
        return
      }
      // Free-form message to agent
      sendMessage(text)
    },
    [state.phase, state.pendingQuestion, start, sendMessage, answerQuestion],
  )

  return (
    <Layout>
      <TopPanels
        left={<ScenarioPanel scenarios={state.scenarios} />}
        right={<WorkerPanel workers={state.workers} />}
      />
      <EventPanel events={state.events} phase={state.phase} />
      <Prompt
        phase={state.phase}
        pendingQuestion={state.pendingQuestion}
        onSubmit={handleSubmit}
      />
    </Layout>
  )
}
