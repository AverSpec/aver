import type { Scenario } from '../workspace/types.js'
import type { AgentEvent } from '../db/event-store.js'
import type { Agent } from '../db/agent-store.js'
import type { Session } from '../db/session-store.js'
import type { StreamEvent } from '../network/stream-events.js'

export type PanelId = 'chat' | 'workers' | 'scenarios' | 'events'

export type ChatMessage =
  | { role: 'system'; text: string; timestamp: string }
  | { role: 'supervisor'; text: string; timestamp: string; streaming?: boolean }
  | { role: 'human'; text: string; timestamp: string }
  | { role: 'question'; text: string; options?: string[]; id: string; timestamp: string; answered?: boolean }

export interface WorkerStatus {
  id: string
  goal: string
  skill: string
  permissionLevel: string
  status: 'running' | 'complete' | 'stuck' | 'error'
  startedAt: number
  completedAt?: number
  result?: { summary: string }
}

export interface PendingQuestion {
  id: string
  question: string
  options?: string[]
  resolve: (answer: string) => void
}

export interface WorkerStreamEntry {
  type: 'text' | 'tool_use' | 'tool_result'
  content: string
  tool?: string
  timestamp: number
}

export interface WorkerStream {
  workerId: string
  entries: WorkerStreamEntry[]
}

export interface TuiState {
  session: Session | undefined
  scenarios: Scenario[]
  workers: WorkerStatus[]
  events: AgentEvent[]
  pendingQuestion: PendingQuestion | undefined
  questionQueue: PendingQuestion[]
  phase: 'awaiting_goal' | 'running' | 'stopped'
  supervisorThinking: boolean
  workerCounter: number
  workerStreams: Map<string, WorkerStream>
  activePanel: PanelId
  inputFocused: boolean
  scrollOffset: number
  chatMessages: ChatMessage[]
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
  | { type: 'supervisor_thinking'; thinking: boolean }
  | { type: 'stream_event'; event: StreamEvent }
  | { type: 'panel_switch'; panel: PanelId }
  | { type: 'input_focus'; focused: boolean }
  | { type: 'scroll'; delta: number }
  | { type: 'scroll_reset' }

export const initialState: TuiState = {
  session: undefined,
  scenarios: [],
  workers: [],
  events: [],
  pendingQuestion: undefined,
  questionQueue: [],
  phase: 'awaiting_goal',
  supervisorThinking: false,
  workerCounter: 0,
  workerStreams: new Map(),
  activePanel: 'chat',
  inputFocused: false,
  scrollOffset: 0,
  chatMessages: [],
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
      const chatMsg = eventToChatMessage(action.event)
      const newChat = chatMsg ? [...state.chatMessages, chatMsg] : state.chatMessages
      return { ...state, events: newEvents, workers: newWorkers, workerCounter: newCounter, chatMessages: newChat }
    }
    case 'events_sync': {
      // Rebuild chat from DB events, but preserve any active streaming message
      const dbChat = action.events.flatMap((e) => {
        const msg = eventToChatMessage(e)
        return msg ? [msg] : []
      })
      const streaming = state.chatMessages.filter((m) => m.role === 'supervisor' && m.streaming)
      const chatMessages = streaming.length > 0 ? [...dbChat, ...streaming] : dbChat
      return { ...state, events: action.events, chatMessages }
    }
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
      // Add question to chat
      const qMsg: ChatMessage = {
        role: 'question',
        text: action.question.question,
        options: action.question.options,
        id: action.question.id,
        timestamp: new Date().toISOString(),
      }
      return {
        ...state,
        pendingQuestion: action.question,
        chatMessages: [...state.chatMessages, qMsg],
        inputFocused: true,
        scrollOffset: 0,
      }
    }
    case 'question_answered': {
      if (state.pendingQuestion?.id === action.questionId) {
        const next = state.questionQueue[0]
        // Mark question as answered in chat
        const updatedChat = state.chatMessages.map((m) =>
          m.role === 'question' && m.id === action.questionId
            ? { ...m, answered: true }
            : m,
        )
        const newState: TuiState = {
          ...state,
          pendingQuestion: next,
          questionQueue: state.questionQueue.slice(1),
          chatMessages: updatedChat,
        }
        // If next question exists, add it to chat and focus input
        if (next) {
          const qMsg: ChatMessage = {
            role: 'question',
            text: next.question,
            options: next.options,
            id: next.id,
            timestamp: new Date().toISOString(),
          }
          newState.chatMessages = [...newState.chatMessages, qMsg]
          newState.inputFocused = true
          newState.scrollOffset = 0
        }
        return newState
      }
      return state
    }
    case 'phase_changed':
      return { ...state, phase: action.phase }
    case 'supervisor_thinking': {
      if (action.thinking) {
        return { ...state, supervisorThinking: true }
      }
      // Finalize any streaming supervisor message
      const finalized = state.chatMessages.map((m) =>
        m.role === 'supervisor' && m.streaming
          ? { ...m, streaming: false }
          : m,
      )
      return { ...state, supervisorThinking: false, chatMessages: finalized }
    }
    case 'stream_event': {
      const se = action.event
      if (se.type === 'supervisor:text') {
        // Accumulate into a streaming chat message
        const last = state.chatMessages[state.chatMessages.length - 1]
        if (last?.role === 'supervisor' && last.streaming) {
          // Append to existing streaming message
          const updated = [...state.chatMessages]
          updated[updated.length - 1] = { ...last, text: last.text + se.text }
          return { ...state, chatMessages: updated, scrollOffset: 0 }
        }
        // Start new streaming message
        const msg: ChatMessage = {
          role: 'supervisor',
          text: se.text,
          timestamp: new Date().toISOString(),
          streaming: true,
        }
        return { ...state, chatMessages: [...state.chatMessages, msg], scrollOffset: 0 }
      }
      // Worker stream events
      const wid = se.workerId
      const newStreams = new Map(state.workerStreams)
      const existing = newStreams.get(wid) ?? { workerId: wid, entries: [] }
      const entry: WorkerStreamEntry = {
        type: se.type === 'worker:text' ? 'text' : se.type === 'worker:tool_use' ? 'tool_use' : 'tool_result',
        content: se.type === 'worker:text' ? se.text : se.type === 'worker:tool_use' ? se.input : se.output,
        tool: se.type !== 'worker:text' ? se.tool : undefined,
        timestamp: Date.now(),
      }
      // Keep last 50 entries per worker
      const entries = [...existing.entries, entry].slice(-50)
      newStreams.set(wid, { workerId: wid, entries })
      return { ...state, workerStreams: newStreams }
    }
    case 'panel_switch':
      return { ...state, activePanel: action.panel, scrollOffset: 0 }
    case 'input_focus':
      return { ...state, inputFocused: action.focused }
    case 'scroll': {
      const newOffset = Math.max(0, state.scrollOffset + action.delta)
      return { ...state, scrollOffset: newOffset }
    }
    case 'scroll_reset':
      return { ...state, scrollOffset: 0 }
    default:
      return state
  }
}

function eventToChatMessage(event: AgentEvent): ChatMessage | undefined {
  const ts = event.createdAt
  switch (event.type) {
    case 'supervisor:message':
      return { role: 'supervisor', text: String(event.data.message ?? ''), timestamp: ts }
    case 'human:message':
      return { role: 'human', text: String(event.data.message ?? ''), timestamp: ts }
    case 'human:answer':
      return { role: 'human', text: String(event.data.answer ?? ''), timestamp: ts }
    case 'session:start':
      return { role: 'system', text: `Session started — goal: "${event.data.goal}"`, timestamp: ts }
    case 'session:stop':
      return { role: 'system', text: `Session stopped — ${event.data.reason}`, timestamp: ts }
    case 'worker:created':
      return { role: 'system', text: `Worker created: ${event.data.goal}`, timestamp: ts }
    case 'worker:complete':
      return { role: 'system', text: `Worker complete: ${event.data.agentId}`, timestamp: ts }
    case 'worker:error':
      return { role: 'system', text: `Worker error: ${event.data.agentId} — ${event.data.error}`, timestamp: ts }
    case 'scenario:advanced':
      return { role: 'system', text: `Scenario advanced: ${event.data.scenarioId} → ${event.data.stage}`, timestamp: ts }
    default:
      return undefined
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
              completedAt: Date.now(),
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
              completedAt: Date.now(),
              result: { summary: (event.data.error as string) ?? 'Unknown error' },
            }
          : w,
      ),
      workerCounter: counter,
    }
  }
  return { workers, workerCounter: counter }
}
