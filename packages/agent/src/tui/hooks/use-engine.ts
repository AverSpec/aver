import { useReducer, useCallback, useRef, useEffect } from 'react'
import type { AgentConfig } from '../../types.js'
import { tuiReducer, initialState } from '../state.js'
import { useQuestion } from './use-question.js'
import { createDatabase, closeDatabase } from '../../db/database.js'
import { AgentStore } from '../../db/agent-store.js'
import { EventStore } from '../../db/event-store.js'
import { AgentNetwork } from '../../network/agent-network.js'
import type { Dispatchers, AgentNetworkCallbacks } from '../../network/agent-network.js'
import type { Client } from '@libsql/client'
import { join } from 'node:path'
import { WorkspaceOps, WorkspaceStore } from '@aver/workspace'

interface EngineHookOptions {
  agentPath: string
  workspacePath: string
  projectId: string
  config: AgentConfig
}

export function useEngine(options: EngineHookOptions) {
  const [state, dispatch] = useReducer(tuiReducer, initialState)
  const { onQuestion, answerQuestion } = useQuestion(dispatch)

  const networkRef = useRef<AgentNetwork | null>(null)
  const dbRef = useRef<Client | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastEventCountRef = useRef(0)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      if (networkRef.current) void networkRef.current.stop()
      if (dbRef.current) closeDatabase(dbRef.current)
    }
  }, [])

  const start = useCallback(
    async (goal: string) => {
      dispatch({ type: 'phase_changed', phase: 'running' })

      try {
        // Create database
        const dbPath = join(options.agentPath, 'agent.db')
        const db = await createDatabase(dbPath)
        dbRef.current = db

        // Create workspace ops
        const store = WorkspaceStore.fromPath(options.workspacePath, options.projectId)
        const workspaceOps = new WorkspaceOps(store)

        // Create dispatchers (stub for now — real SDK dispatchers are wired in CLI)
        const dispatchers: Dispatchers = {
          supervisorDispatch: async (_sys: string, _user: string) => {
            return { response: '{"action":"stop","reason":"TUI dispatchers not wired to LLM yet"}', tokenUsage: 0 }
          },
          workerDispatch: async (_sys: string, _user: string) => {
            return { response: 'Worker stub', tokenUsage: 0 }
          },
        }

        // Create callbacks
        const callbacks: AgentNetworkCallbacks = {
          onMessage: (msg: string) => {
            dispatch({
              type: 'event',
              event: {
                id: `msg-${Date.now()}`,
                type: 'human:message',
                data: { message: msg },
                createdAt: new Date().toISOString(),
              },
            })
          },
          onQuestion: async (question: string) => {
            return onQuestion(question)
          },
        }

        // Create and start network
        const network = new AgentNetwork(db, dispatchers, workspaceOps, {
          maxCycleDepth: options.config.cycles.maxCycleDepth,
          supervisorModel: options.config.model.supervisor,
          workerModel: options.config.model.worker,
          claudeExecutablePath: options.config.claudeExecutablePath,
        }, callbacks)

        networkRef.current = network

        // Start polling for state updates
        const agentStore = new AgentStore(db)
        const eventStore = new EventStore(db)

        pollTimerRef.current = setInterval(async () => {
          try {
            // Poll events
            const events = await eventStore.getEvents()
            if (events.length !== lastEventCountRef.current) {
              lastEventCountRef.current = events.length
              dispatch({ type: 'events_sync', events })
            }

            // Poll workers
            const agents = await agentStore.getActiveWorkers()
            dispatch({ type: 'workers_sync', agents })

            // Poll scenarios
            const scenarios = await workspaceOps.getScenarios()
            dispatch({ type: 'scenarios_updated', scenarios })
          } catch {
            // Swallow polling errors — the stores may not exist yet
          }
        }, 1000)

        // Start the network
        await network.start(goal)
      } catch (err) {
        dispatch({
          type: 'event',
          event: {
            id: `err-${Date.now()}`,
            type: 'error',
            data: { message: err instanceof Error ? err.message : String(err) },
            createdAt: new Date().toISOString(),
          },
        })
        dispatch({ type: 'phase_changed', phase: 'stopped' })
      }
    },
    [dispatch, onQuestion, options],
  )

  const sendMessage = useCallback(
    async (message: string) => {
      if (networkRef.current) {
        await networkRef.current.handleHumanMessage(message)
      }
    },
    [],
  )

  return { state, dispatch, start, sendMessage, answerQuestion }
}
