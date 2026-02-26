import { resolve } from 'node:path'
import type { AgentSession, AgentEvent } from './types.js'
import { createDatabase, closeDatabase } from './db/index.js'
import { SessionStore } from './db/session-store.js'
import { EventStore } from './db/event-store.js'

function dbPath(agentPath: string): string {
  return resolve(agentPath, 'aver-agent.db')
}

/**
 * Load the most recent running session from the SQLite database.
 * Returns the legacy AgentSession shape for backward compatibility with the CLI.
 */
export async function loadSession(agentPath: string): Promise<AgentSession | undefined> {
  let db
  try {
    db = await createDatabase(dbPath(agentPath))
  } catch {
    // Database doesn't exist yet — no session
    return undefined
  }

  try {
    const store = new SessionStore(db)
    const session = await store.getCurrentSession()
    if (!session) return undefined

    // Map v2 Session to legacy AgentSession shape
    return {
      id: session.id,
      goal: session.goal,
      status: session.status,
      cycleCount: 0, // v2 doesn't track cycles the same way; placeholder
      workerCount: 0, // could query AgentStore but not critical for status display
      tokenUsage: {
        supervisor: session.tokenUsage.supervisor,
        worker: session.tokenUsage.worker,
      },
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }
  } finally {
    closeDatabase(db)
  }
}

/**
 * Read all events from the SQLite database.
 * Returns the legacy AgentEvent shape for backward compatibility with the CLI.
 */
export async function readEvents(agentPath: string): Promise<AgentEvent[]> {
  let db
  try {
    db = await createDatabase(dbPath(agentPath))
  } catch {
    return []
  }

  try {
    const store = new EventStore(db)
    const events = await store.getEvents()

    // Map v2 AgentEvent (db) to legacy AgentEvent (types.ts)
    return events.map((e) => ({
      timestamp: e.createdAt,
      type: e.type as AgentEvent['type'],
      cycleId: e.agentId ?? '',
      data: e.data,
    }))
  } finally {
    closeDatabase(db)
  }
}

/**
 * Request a graceful stop by updating the current session status.
 */
export async function requestStop(agentPath: string): Promise<void> {
  let db
  try {
    db = await createDatabase(dbPath(agentPath))
  } catch {
    throw new Error(`No agent database found at ${dbPath(agentPath)}`)
  }

  try {
    const store = new SessionStore(db)
    const session = await store.getCurrentSession()
    if (!session) {
      throw new Error('No active agent session to stop.')
    }

    await store.updateSession(session.id, { status: 'complete' })
  } finally {
    closeDatabase(db)
  }
}
