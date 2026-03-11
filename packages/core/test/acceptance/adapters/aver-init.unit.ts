import { existsSync, readFileSync, readdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { adapt, unit } from '../../../src/index'
import { averInit } from '../domains/aver-init'
import { initProjectFiles, initDomainFiles } from '../../../src/cli/scaffold'

interface InitTestSession {
  dir: string
  lastError?: Error
}

export const averInitAdapter = adapt(averInit, {
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
      if (!existsSync(path))
        throw new Error(`Expected file to exist: ${path}`)
    },
    fileContains: async (_session, { path, content, shouldContain }) => {
      const actual = readFileSync(path, 'utf-8')
      if (shouldContain === false) {
        if (actual.includes(content))
          throw new Error(`Expected file not to contain "${content}"`)
      } else {
        if (!actual.includes(content))
          throw new Error(`Expected file to contain "${content}"`)
      }
    },
    configRegistersAdapter: async (_session, { dir, adapterImport }) => {
      const configPath = join(dir, 'aver.config.ts')
      const config = readFileSync(configPath, 'utf-8')
      if (!config.includes(adapterImport))
        throw new Error(`Expected config to contain "${adapterImport}"`)
    },
    throwsError: async (session, { message }) => {
      if (!session.lastError)
        throw new Error('Expected an error to have been thrown')
      if (!session.lastError.message.includes(message))
        throw new Error(`Expected error message to contain "${message}" but got "${session.lastError.message}"`)
    },
  },
})
