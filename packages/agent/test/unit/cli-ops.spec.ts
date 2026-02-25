import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSession, readEvents, requestStop } from '../../src/cli-ops.js'

describe('cli-ops', () => {
  let agentPath: string

  beforeEach(async () => {
    agentPath = await mkdtemp(join(tmpdir(), 'aver-cli-ops-'))
  })

  describe('loadSession', () => {
    it('returns undefined when no session exists', async () => {
      expect(await loadSession(agentPath)).toBeUndefined()
    })

    it('returns session data when session.json exists', async () => {
      const session = {
        id: 'session-test',
        goal: 'test goal',
        status: 'running',
        cycleCount: 3,
        workerCount: 1,
        tokenUsage: { supervisor: 100, worker: 200 },
        createdAt: '2026-02-24T00:00:00Z',
        updatedAt: '2026-02-24T00:01:00Z',
      }
      await writeFile(join(agentPath, 'session.json'), JSON.stringify(session))
      const result = await loadSession(agentPath)
      expect(result?.id).toBe('session-test')
      expect(result?.goal).toBe('test goal')
    })
  })

  describe('readEvents', () => {
    it('returns empty array when no events exist', async () => {
      expect(await readEvents(agentPath)).toEqual([])
    })

    it('reads events from events.jsonl', async () => {
      const event1 = { timestamp: '2026-02-24T00:00:00Z', type: 'cycle:start', cycleId: 'cycle-0', data: {} }
      const event2 = { timestamp: '2026-02-24T00:00:01Z', type: 'decision', cycleId: 'cycle-0', data: { action: 'stop' } }
      await writeFile(join(agentPath, 'events.jsonl'), JSON.stringify(event1) + '\n' + JSON.stringify(event2) + '\n')
      const events = await readEvents(agentPath)
      expect(events).toHaveLength(2)
      expect(events[0].type).toBe('cycle:start')
    })
  })

  describe('requestStop', () => {
    it('updates session status to stopped', async () => {
      const session = {
        id: 'session-test',
        goal: 'test goal',
        status: 'running',
        cycleCount: 0,
        workerCount: 0,
        tokenUsage: { supervisor: 0, worker: 0 },
        createdAt: '2026-02-24T00:00:00Z',
        updatedAt: '2026-02-24T00:00:00Z',
      }
      await writeFile(join(agentPath, 'session.json'), JSON.stringify(session))
      await requestStop(agentPath)
      const updated = await loadSession(agentPath)
      expect(updated?.status).toBe('stopped')
    })

    it('throws when no session exists', async () => {
      await expect(requestStop(agentPath)).rejects.toThrow()
    })
  })
})
