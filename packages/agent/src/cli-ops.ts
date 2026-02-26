// TODO: wire to AgentNetwork — old memory/session and memory/events deleted in Task 16
import type { AgentSession, AgentEvent } from './types.js'

export async function loadSession(_agentPath: string): Promise<AgentSession | undefined> {
  // TODO: wire to AgentNetwork (Task 19) — use db/session-store via database client
  return undefined
}

export async function readEvents(_agentPath: string): Promise<AgentEvent[]> {
  // TODO: wire to AgentNetwork (Task 19) — use db/event-store via database client
  return []
}

export async function requestStop(_agentPath: string): Promise<void> {
  // TODO: wire to AgentNetwork (Task 19) — use db/session-store via database client
  throw new Error('Not yet wired to AgentNetwork')
}
