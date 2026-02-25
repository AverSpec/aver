import { useCallback, useRef } from 'react'
import type { TuiAction } from '../state.js'

let questionCounter = 0

export function useQuestion(dispatch: (action: TuiAction) => void) {
  const resolverRef = useRef<Map<string, (answer: string) => void>>(new Map())

  const onQuestion = useCallback(
    async (question: string, options?: string[]): Promise<string> => {
      const id = `q-${++questionCounter}`
      return new Promise<string>((resolve) => {
        resolverRef.current.set(id, resolve)
        dispatch({
          type: 'question_received',
          question: { id, question, options, resolve },
        })
      })
    },
    [dispatch],
  )

  const answerQuestion = useCallback(
    (questionId: string) => {
      resolverRef.current.delete(questionId)
      dispatch({ type: 'question_answered', questionId })
    },
    [dispatch],
  )

  return { onQuestion, answerQuestion }
}
