import type { Scenario } from '../workspace/types.js'
import type { AgentEvent } from '../db/event-store.js'
import type { Agent } from '../db/agent-store.js'
import type { Session } from '../db/session-store.js'

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
  session: Session | undefined
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
  | { type: 'events_sync'; events: AgentEvent[] }
  | { type: 'workers_sync'; agents: Agent[] }
  | { type: 'scenarios_updated'; scenarios: Scenario[] }
  | { type: 'session_updated'; session: Session }
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
    case 'events_sync':
      return { ...state, events: action.events }
    case 'workers_sync':
      return {
        ...state,
        workers: action.agents.map(agentToWorkerStatus),
        workerCounter: action.agents.length,
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

function agentToWorkerStatus(agent: Agent): WorkerStatus {
  const statusMap: Record<Agent['status'], WorkerStatus['status']> = {
    idle: 'complete',
    active: 'running',
    terminated: 'complete',
  }
  return {
    id: agent.id,
    goal: agent.goal,
    skill: agent.skill ?? 'general',
    permissionLevel: agent.permission ?? 'read_only',
    status: statusMap[agent.status],
    startedAt: new Date(agent.createdAt).getTime(),
  }
}

function deriveWorkerUpdate(
  workers: WorkerStatus[],
  counter: number,
  event: AgentEvent,
): { workers: WorkerStatus[]; workerCounter: number } {
  if (event.type === 'worker:created') {
    const newCounter = counter + 1
    const id = (event.data.agentId as string) ?? `worker-${newCounter}`
    return {
      workers: [
        ...workers,
        {
          id,
          goal: (event.data.goal as string) ?? '',
          skill: (event.data.skill as string) ?? '',
          permissionLevel: (event.data.permission as string) ?? 'read_only',
          status: 'running',
          startedAt: Date.now(),
        },
      ],
      workerCounter: newCounter,
    }
  }
  if (event.type === 'worker:complete') {
    const agentId = event.data.agentId as string | undefined
    const target = agentId
      ? workers.find((w) => w.id === agentId)
      : [...workers].reverse().find((w) => w.status === 'running')
    if (!target) return { workers, workerCounter: counter }
    return {
      workers: workers.map((w) =>
        w.id === target.id
          ? {
              ...w,
              status: 'complete' as const,
              result: { summary: (event.data.summary as string) ?? '' },
            }
          : w,
      ),
      workerCounter: counter,
    }
  }
  if (event.type === 'worker:error') {
    const agentId = event.data.agentId as string | undefined
    const target = agentId
      ? workers.find((w) => w.id === agentId)
      : [...workers].reverse().find((w) => w.status === 'running')
    if (!target) return { workers, workerCounter: counter }
    return {
      workers: workers.map((w) =>
        w.id === target.id
          ? {
              ...w,
              status: 'error' as const,
              result: { summary: (event.data.error as string) ?? 'Unknown error' },
            }
          : w,
      ),
      workerCounter: counter,
    }
  }
  return { workers, workerCounter: counter }
}
