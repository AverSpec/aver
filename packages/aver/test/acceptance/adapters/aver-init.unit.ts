import { existsSync, readFileSync, readdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect } from 'vitest'
import { implement, unit } from '../../../src/index'
import { averInit } from '../domains/aver-init'
import { initProjectFiles, initDomainFiles } from '../../../src/cli/scaffold'

interface InitTestSession {
  dir: string
  lastError?: Error
}

export const averInitAdapter = implement(averInit, {
  protocol: unit<InitTestSession>(() => {
    const dir = mkdtempSync(join(tmpdir(), 'aver-init-'))
    return { dir }
  }),

  actions: {
    initProject: async (session, { dir }) => {
      initProjectFiles(dir)
    },
    initDomain: async (session, { dir, name, protocol }) => {
      try {
        session.lastError = undefined
        initDomainFiles(dir, name, protocol)
      } catch (e: any) {
        session.lastError = e
      }
    },
  },

  queries: {
    sessionDir: async (session) => {
      return session.dir
    },
    fileContents: async (_session, { path }) => {
      return readFileSync(path, 'utf-8')
    },
    generatedFiles: async (_session, { dir }) => {
      const files: string[] = []
      const entries = readdirSync(dir, { withFileTypes: true, recursive: true })
      for (const entry of entries) {
        if (entry.isFile()) {
          const rel = join(entry.parentPath ?? entry.path, entry.name)
            .replace(dir + '/', '')
            .replace(dir + '\\', '')
          files.push(rel)
        }
      }
      return files.sort()
    },
  },

  assertions: {
    fileExists: async (_session, { path }) => {
      expect(existsSync(path)).toBe(true)
    },
    fileContains: async (_session, { path, content }) => {
      const actual = readFileSync(path, 'utf-8')
      expect(actual).toContain(content)
    },
    configRegistersAdapter: async (_session, { dir, adapterImport }) => {
      const configPath = join(dir, 'aver.config.ts')
      const config = readFileSync(configPath, 'utf-8')
      expect(config).toContain(adapterImport)
    },
    throwsError: async (session, { message }) => {
      expect(session.lastError).toBeDefined()
      expect(session.lastError!.message).toContain(message)
    },
  },
})
