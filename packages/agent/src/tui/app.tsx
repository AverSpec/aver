import React, { useCallback, useEffect, useRef } from 'react'
import { TuiShell } from './components/tui-shell.js'
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
  const { state, dispatch, start, sendMessage, answerQuestion } = useEngine({
    agentPath,
    workspacePath,
    projectId,
    config,
  })
  const startedRef = useRef(false)

  // Auto-start: with goal if provided, otherwise open session
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true
      start(goal)
    }
  }, [goal, start])

  const handleSubmit = useCallback(
    (text: string) => {
      if (state.pendingQuestion) {
        answerQuestion(state.pendingQuestion.id)
        return
      }
      sendMessage(text)
    },
    [state.pendingQuestion, sendMessage, answerQuestion],
  )

  return <TuiShell state={state} dispatch={dispatch} onSubmit={handleSubmit} />
}
