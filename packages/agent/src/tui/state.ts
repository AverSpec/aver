import type { Scenario } from '@aver/workspace'
import type { AgentEvent, AgentSession } from '../types.js'

export interface WorkerStatus {
  id: string
  goal: string
  skill: string
  permissionLevel: string
  status: 'running' | 'complete' | 'stuck' | 'error'
  startedAt: number
  result?: { summary: string }
}

export interface PendingQuestion {
  id: string
  question: string
  options?: string[]
  resolve: (answer: string) => void
}

export interface TuiState {
  session: AgentSession | undefined
  scenarios: Scenario[]
  workers: WorkerStatus[]
  events: AgentEvent[]
  pendingQuestion: PendingQuestion | undefined
  questionQueue: PendingQuestion[]
  phase: 'awaiting_goal' | 'running' | 'stopped'
  workerCounter: number
}

export type TuiAction =
  | { type: 'event'; event: AgentEvent }
  | { type: 'scenarios_updated'; scenarios: Scenario[] }
  | { type: 'session_updated'; session: AgentSession }
  | { type: 'question_received'; question: PendingQuestion }
  | { type: 'question_answered'; questionId: string }
  | { type: 'phase_changed'; phase: TuiState['phase'] }

export const initialState: TuiState = {
  session: undefined,
  scenarios: [],
  workers: [],
  events: [],
  pendingQuestion: undefined,
  questionQueue: [],
  phase: 'awaiting_goal',
  workerCounter: 0,
}

export function tuiReducer(state: TuiState, action: TuiAction): TuiState {
  switch (action.type) {
    case 'event': {
      const newEvents = [...state.events, action.event]
      const { workers: newWorkers, workerCounter: newCounter } = deriveWorkerUpdate(
        state.workers,
        state.workerCounter,
        action.event,
      )
      return { ...state, events: newEvents, workers: newWorkers, workerCounter: newCounter }
    }
    case 'scenarios_updated':
      return { ...state, scenarios: action.scenarios }
    case 'session_updated':
      return { ...state, session: action.session }
    case 'question_received': {
      if (state.pendingQuestion) {
        return { ...state, questionQueue: [...state.questionQueue, action.question] }
      }
      return { ...state, pendingQuestion: action.question }
    }
    case 'question_answered': {
      if (state.pendingQuestion?.id === action.questionId) {
        const next = state.questionQueue[0]
        return {
          ...state,
          pendingQuestion: next,
          questionQueue: state.questionQueue.slice(1),
        }
      }
      return state
    }
    case 'phase_changed':
      return { ...state, phase: action.phase }
    default:
      return state
  }
}

function deriveWorkerUpdate(
  workers: WorkerStatus[],
  counter: number,
  event: AgentEvent,
): { workers: WorkerStatus[]; workerCounter: number } {
  if (event.type === 'worker:dispatch') {
    const newCounter = counter + 1
    const id = `worker-${newCounter}`
    return {
      workers: [
        ...workers,
        {
          id,
          goal: (event.data.goal as string) ?? '',
          skill: (event.data.skill as string) ?? '',
          permissionLevel: (event.data.permissionLevel as string) ?? 'read_only',
          status: 'running',
          startedAt: Date.now(),
        },
      ],
      workerCounter: newCounter,
    }
  }
  if (event.type === 'worker:result') {
    const lastRunning = [...workers].reverse().find((w) => w.status === 'running')
    if (!lastRunning) return { workers, workerCounter: counter }
    return {
      workers: workers.map((w) =>
        w.id === lastRunning.id
          ? {
              ...w,
              status: ((event.data.status as string) ?? 'complete') as WorkerStatus['status'],
              result: { summary: (event.data.summary as string) ?? '' },
            }
          : w,
      ),
      workerCounter: counter,
    }
  }
  return { workers, workerCounter: counter }
}
