import { useReducer, useCallback, useRef } from 'react'
import { CycleEngine } from '../../index.js'
import type { AgentConfig } from '../../types.js'
import { tuiReducer, initialState } from '../state.js'
import type { TuiAction } from '../state.js'
import { useQuestion } from './use-question.js'

interface EngineHookOptions {
  agentPath: string
  workspacePath: string
  projectId: string
  config: AgentConfig
}

export function useEngine(options: EngineHookOptions) {
  const [state, dispatch] = useReducer(tuiReducer, initialState)
  const engineRef = useRef<CycleEngine | null>(null)
  const { onQuestion, answerQuestion } = useQuestion(dispatch)

  const getEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new CycleEngine({
        ...options,
        onMessage: (message: string) => {
          dispatch({
            type: 'event',
            event: {
              timestamp: new Date().toISOString(),
              type: 'decision',
              cycleId: 'msg',
              data: { message },
            },
          })
        },
        onQuestion,
      })
    }
    return engineRef.current
  }, [options, onQuestion])

  const start = useCallback(
    async (goal: string) => {
      dispatch({ type: 'phase_changed', phase: 'running' })
      const engine = getEngine()
      try {
        await engine.start(goal)
      } catch {
        // Engine handles errors internally
      }
      const session = await engine.getSession()
      if (session) dispatch({ type: 'session_updated', session })
      dispatch({ type: 'phase_changed', phase: 'stopped' })
    },
    [getEngine],
  )

  const sendMessage = useCallback(
    async (message: string) => {
      const engine = getEngine()
      try {
        await engine.resume(message)
      } catch {
        // Engine handles errors internally
      }
    },
    [getEngine],
  )

  return { state, dispatch, start, sendMessage, answerQuestion }
}
