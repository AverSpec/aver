import { useReducer, useCallback, useRef, useEffect } from 'react'
import type { AgentConfig } from '../../types.js'
import { tuiReducer, initialState } from '../state.js'
import { useQuestion } from './use-question.js'
import { createDatabase, closeDatabase } from '../../db/database.js'
import { AgentStore } from '../../db/agent-store.js'
import { EventStore } from '../../db/event-store.js'
import { AgentNetwork } from '../../network/agent-network.js'
import type { AgentNetworkCallbacks } from '../../network/agent-network.js'
import { createSdkDispatchers } from '../../network/sdk-dispatchers.js'
import type { Client } from '@libsql/client'
import { join } from 'node:path'
import { WorkspaceOps } from '../../workspace/operations.js'
import { WorkspaceStore } from '../../workspace/storage.js'

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

        const dispatchers = createSdkDispatchers({
          claudeExecutablePath: options.config.claudeExecutablePath,
          supervisorModel: options.config.model.supervisor,
          workerModel: options.config.model.worker,
          maxWorkerTurns: options.config.cycles.maxWorkerIterations,
          timeouts: {
            supervisorTotalMs: options.config.timeouts?.supervisorCallMs,
            workerTurnMs: options.config.timeouts?.workerTurnMs,
            workerTotalMs: options.config.timeouts?.workerTotalMs,
          },
        })

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
