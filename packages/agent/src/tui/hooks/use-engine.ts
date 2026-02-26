// TODO: wire to AgentNetwork (Task 18) — CycleEngine deleted in Task 16
import { useReducer, useCallback } from 'react'
import type { AgentConfig as _AgentConfig } from '../../types.js'
import { tuiReducer, initialState } from '../state.js'
import type { TuiAction as _TuiAction } from '../state.js'
import { useQuestion } from './use-question.js'

interface EngineHookOptions {
  agentPath: string
  workspacePath: string
  projectId: string
  config: _AgentConfig
}

export function useEngine(_options: EngineHookOptions) {
  const [state, dispatch] = useReducer(tuiReducer, initialState)
  const { answerQuestion } = useQuestion(dispatch)

  const start = useCallback(
    async (_goal: string) => {
      // TODO: wire to AgentNetwork (Task 18)
      dispatch({ type: 'phase_changed', phase: 'running' })
      dispatch({ type: 'phase_changed', phase: 'stopped' })
    },
    [dispatch],
  )

  const sendMessage = useCallback(
    async (_message: string) => {
      // TODO: wire to AgentNetwork (Task 18)
    },
    [],
  )

  return { state, dispatch, start, sendMessage, answerQuestion }
}
