import { SessionStore } from './memory/session.js'
import { EventLog } from './memory/events.js'
import type { AgentSession, AgentEvent } from './types.js'

export async function loadSession(agentPath: string): Promise<AgentSession | undefined> {
  const store = new SessionStore(agentPath)
  return store.load()
}

export async function readEvents(agentPath: string): Promise<AgentEvent[]> {
  const log = new EventLog(agentPath)
  return log.readAll()
}

export async function requestStop(agentPath: string): Promise<void> {
  const store = new SessionStore(agentPath)
  const session = await store.load()
  if (!session) {
    throw new Error('No active session to stop')
  }
  await store.updateStatus('stopped')
}
